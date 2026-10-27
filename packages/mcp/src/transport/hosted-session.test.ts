/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sessions of the hosted endpoint: a project chained across separate requests
 * by a signed token the client holds, with the server stateless.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleHostedMcp, type HostedOptions } from './hosted.js';
import { issueToken, MAX_SESSION_MODELS, TOKEN_TTL_MS, verifyToken, withSessions, type SessionState } from './hosted-session.js';
import { ModelCache, hostedModelCache } from '../tools/hosted-model-cache.js';
import { ifcsheetTools } from '../tools/ifcsheet.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[mcp] skipping the hosted session FZK tests: ${missing}`);

const SECRET = 's3cret-'.repeat(8);
let clock = 1_800_000_000_000;
const ON = (): HostedOptions => ({ env: { IFCSHEET_HOSTED_MCP: '1', IFCSHEET_HOSTED_MCP_SECRET: SECRET }, now: () => clock });
const post = (body: unknown, options: HostedOptions = ON()) =>
  handleHostedMcp(new Request('https://example.test/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), options);
const rpc = (id: number, method: string, params?: unknown) => ({ jsonrpc: '2.0', id, method, params });
const call = async (name: string, args: Record<string, unknown>, options?: HostedOptions) => {
  const res = await post(rpc(2, 'tools/call', { name, arguments: args }), options);
  expect(res.status).toBe(200);
  return ((await res.json()) as { result: { isError?: boolean; content: { text: string }[]; structuredContent?: any } }).result;
};
const ifc_base64 = () => readFileSync(FZK).toString('base64');

beforeEach(() => { hostedModelCache.cache.clear(); });

describe('hosted MCP sessions: the token', () => {
  const state: SessionState = { exp: clock + TOKEN_TTL_MS, nextModel: 2, nextSet: 1, models: [], sets: [] };

  it('round-trips, and refuses a changed signature, a changed payload, another secret and an expired token', () => {
    const token = issueToken(state, SECRET);
    expect(verifyToken(token, SECRET, clock).nextModel).toBe(2);
    const [prefix, body, sig] = token.split('.');
    const flip = (s: string) => `${s.slice(0, -2)}${s.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(() => verifyToken(`${prefix}.${body}.${flip(sig)}`, SECRET, clock)).toThrow(/not valid/);
    expect(() => verifyToken(`${prefix}.${flip(body)}.${sig}`, SECRET, clock)).toThrow(/not valid/);
    expect(() => verifyToken(token, 'another-secret-another-secret-another', clock)).toThrow(/not valid/);
    expect(() => verifyToken('garbage', SECRET, clock)).toThrow(/not a token/);
    expect(() => verifyToken(token, SECRET, state.exp + 1)).toThrow(/expired/);
  });

  it('leaves the tools unchanged without a secret of 32 characters: the endpoint stays stateless', () => {
    expect(withSessions(ifcsheetTools, undefined)).toBe(ifcsheetTools);
    expect(withSessions(ifcsheetTools, { secret: 'short' })).toBe(ifcsheetTools);
  });

  it('is refused at the endpoint when session_token is sent but no secret is set', async () => {
    const res = await post(rpc(2, 'tools/call', { name: 'ifcsheet_open_model', arguments: { session_token: 'x' } }), { env: { IFCSHEET_HOSTED_MCP: '1' } });
    const out = (await res.json()) as any;
    expect(out.result.isError).toBe(true);
  });

  it('answers 404 with the flag off, secret or not', async () => {
    const res = await post(rpc(1, 'ping'), { env: { IFCSHEET_HOSTED_MCP_SECRET: SECRET } });
    expect(res.status).toBe(404);
  });
});

describe('hosted MCP sessions: the cache', () => {
  it('evicts the least recently used model past the count, and past the cost, and never keeps one over the cap', () => {
    const c = new ModelCache<string>(2, 100);
    c.set('a', 'A', 10); c.set('b', 'B', 10);
    c.get('a'); // a is now the most recent
    c.set('c', 'C', 10);
    expect(c.keys()).toEqual(['a', 'c']);
    c.set('d', 'D', 95);
    expect(c.keys()).toEqual(['d']);
    c.set('huge', 'H', 101);
    expect(c.keys()).toEqual(['d']);
  });

  it('a token names at most MAX_SESSION_MODELS models: the oldest goes with its sets', () => {
    expect(MAX_SESSION_MODELS).toBe(8);
  });
});

describe.skipIf(missing !== null)('hosted MCP sessions: a project across requests', () => {
  async function started() {
    const opened = await call('ifcsheet_open_model', { ifc_base64: ifc_base64() });
    expect(opened.isError).toBeFalsy();
    expect(typeof opened.structuredContent.session_token).toBe('string');
    return opened;
  }

  it('chains open_model, generate_set, add_view and export_pdf in four separate requests', async () => {
    const opened = await started();
    const generated = await call('ifcsheet_generate_set', { model_id: opened.structuredContent.model_id, session_token: opened.structuredContent.session_token, ifc_base64: ifc_base64() });
    expect(generated.isError).toBeFalsy();
    const document_id = generated.structuredContent.document_id;
    const viewsBefore = generated.structuredContent.views.length;
    hostedModelCache.cache.clear(); // another instance: the server holds nothing, the model is parsed again from the bytes
    const added = await call('ifcsheet_add_view', { document_id, kind: 'section', axis: 'front', name: 'Chained section', session_token: generated.structuredContent.session_token, ifc_base64: ifc_base64() });
    expect(added.isError).toBeFalsy();
    const pdf = await call('ifcsheet_export_pdf', { document_id, session_token: added.structuredContent.session_token, ifc_base64: ifc_base64() });
    expect(pdf.isError).toBeFalsy();
    expect(Buffer.from(pdf.structuredContent.pdf_base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
    // The view added in request 3 is in the project request 4 drew.
    const token = verifyToken(pdf.structuredContent.session_token, SECRET, clock);
    const views = token.sets.find((s) => s.id === document_id)!.set.document.views;
    expect(views.length).toBe(viewsBefore + 1);
    expect(views.some((v) => v.name === 'Chained section')).toBe(true);
  });

  it('asks for the model again when a call names it without ifc_base64, and refuses other bytes', async () => {
    const opened = await started();
    const base = { model_id: opened.structuredContent.model_id, session_token: opened.structuredContent.session_token };
    const none = await call('ifcsheet_generate_set', base);
    expect(none.isError).toBe(true);
    expect(none.structuredContent.message).toContain('send the same file again as ifc_base64');
    const other = await call('ifcsheet_generate_set', { ...base, ifc_base64: Buffer.from('ISO-10303-21; not the same').toString('base64') });
    expect(other.isError).toBe(true);
    expect(other.structuredContent.message).toContain('differs from the one this session opened');
  });

  it('refuses a tampered token and an expired one with a clear error', async () => {
    const opened = await started();
    const token: string = opened.structuredContent.session_token;
    const args = { model_id: opened.structuredContent.model_id, ifc_base64: ifc_base64() };
    const [prefix, body, sig] = token.split('.');
    const tampered = `${prefix}.${body}.${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`;
    const bad = await call('ifcsheet_generate_set', { ...args, session_token: tampered });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent.message).toContain('not valid');
    clock += TOKEN_TTL_MS + 1;
    const late = await call('ifcsheet_generate_set', { ...args, session_token: token });
    expect(late.isError).toBe(true);
    expect(late.structuredContent.message).toContain('expired');
    clock -= TOKEN_TTL_MS + 1;
  });

  it('keeps parallel sessions apart', async () => {
    const a = await started();
    const b = await started();
    const gen = (s: any) => call('ifcsheet_generate_set', { model_id: s.structuredContent.model_id, session_token: s.structuredContent.session_token, ifc_base64: ifc_base64() });
    const [ga, gb] = [await gen(a), await gen(b)];
    const addA = await call('ifcsheet_add_view', { document_id: ga.structuredContent.document_id, kind: 'section', axis: 'front', name: 'Only in A', session_token: ga.structuredContent.session_token, ifc_base64: ifc_base64() });
    expect(addA.isError).toBeFalsy();
    const viewsOf = async (r: any) => {
      const out = await call('ifcsheet_export_pdf', { document_id: r.structuredContent.document_id, session_token: r.structuredContent.session_token, ifc_base64: ifc_base64() });
      const state = verifyToken(out.structuredContent.session_token, SECRET, clock);
      return state.sets[0].set.document.views.map((v) => v.name);
    };
    expect(await viewsOf(addA)).toContain('Only in A');
    expect(await viewsOf(gb)).not.toContain('Only in A');
  });

  it('refuses two sessions in one batch', async () => {
    const a = await started();
    const b = await call('ifcsheet_generate_set', { model_id: a.structuredContent.model_id, session_token: a.structuredContent.session_token, ifc_base64: ifc_base64() });
    expect(b.structuredContent.session_token).not.toBe(a.structuredContent.session_token);
    const res = await post([
      rpc(1, 'tools/call', { name: 'ifcsheet_check_readiness', arguments: { model_id: 'sheetmodel-1', session_token: a.structuredContent.session_token, ifc_base64: ifc_base64() } }),
      rpc(2, 'tools/call', { name: 'ifcsheet_check_readiness', arguments: { model_id: 'sheetmodel-1', session_token: b.structuredContent.session_token, ifc_base64: ifc_base64() } }),
    ]);
    const out = (await res.json()) as any[];
    expect(out[1].result.isError).toBe(true);
    expect(out[1].result.structuredContent.message).toContain('one session');
  });

  it('still refuses a file path inside a session', async () => {
    const opened = await started();
    const res = await call('ifcsheet_open_model', { file_path: '/etc/hosts', session_token: opened.structuredContent.session_token });
    expect(res.isError).toBe(true);
    expect(res.structuredContent.code).toBe('PERMISSION_DENIED');
  });
});
