/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hosted endpoint (#165): off unless IFCSHEET_HOSTED_MCP=1, stateless
 * Streamable HTTP, no file paths, a cap on the model, and a drawing set from
 * AC20-FZK-Haus passed in the request.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { hostedModelCache } from '../tools/hosted-model-cache.js';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { handleHostedMcp, MAX_BATCH, type HostedOptions } from './hosted.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[mcp] skipping the hosted FZK test: ${missing}`);

const ON: HostedOptions = { env: { IFCSHEET_HOSTED_MCP: '1' } };
const post = (body: unknown, options: HostedOptions = ON) =>
  handleHostedMcp(new Request('https://example.test/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) }), options);
const rpc = (id: number, method: string, params?: unknown) => ({ jsonrpc: '2.0', id, method, params });
const INIT = rpc(1, 'initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'hosted-test', version: '0' } });
const call = async (name: string, args: Record<string, unknown>, options?: HostedOptions) => {
  const res = await post(rpc(2, 'tools/call', { name, arguments: args }), options);
  expect(res.status).toBe(200);
  return ((await res.json()) as { result: { isError?: boolean; structuredContent?: any } }).result;
};

describe('hosted MCP endpoint (#165)', () => {
  // A parsed model kept by an earlier test would make the wall-time test below finish before its deadline.
  beforeEach(() => { hostedModelCache.cache.clear(); });

  it('answers 404 unless IFCSHEET_HOSTED_MCP=1', async () => {
    for (const env of [{}, { IFCSHEET_HOSTED_MCP: '0' }, { IFCSHEET_HOSTED_MCP: 'true' }]) {
      expect((await post(INIT, { env })).status).toBe(404);
    }
  });

  it('initializes and lists the ifcsheet tools over Streamable HTTP, with no earlier session', async () => {
    const init = await post(INIT);
    expect(init.status).toBe(200);
    expect(init.headers.get('content-type')).toContain('application/json');
    expect(((await init.json()) as any).result.protocolVersion).toBe(PROTOCOL_VERSION);
    // A second request carries no session id and still works: nothing is kept between requests.
    const list = (await (await post(rpc(2, 'tools/list'))).json()) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toContain('ifcsheet_generate_set');
    expect(names.every((n) => n.startsWith('ifcsheet_'))).toBe(true);
  });

  it('answers notifications with 202 and other methods than POST with 405', async () => {
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await handleHostedMcp(new Request('https://example.test/mcp', { method: 'GET' }), ON)).status).toBe(405);
  });

  it('refuses a file path in hosted mode', async () => {
    const result = await call('ifcsheet_open_model', { file_path: '/etc/hosts' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe('PERMISSION_DENIED');
    expect(result.structuredContent.message).toContain('no access to a file system');
    const write = await call('ifcsheet_export_pdf', { document_id: 'sheetset-1', file_path: '/tmp/x.pdf' });
    expect(write.isError).toBe(true);
  });

  it('refuses a model over the size cap with an error result', async () => {
    const result = await call('ifcsheet_open_model', { ifc_base64: Buffer.alloc(2048, 65).toString('base64') }, { ...ON, maxModelBytes: 1024 });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe('INVALID_INPUT');
    expect(result.structuredContent.message).toContain('larger than the 1,024 byte limit');
  });

  it('refuses a request body over the cap with 413 and a JSON-RPC error', async () => {
    const res = await post(rpc(2, 'tools/call', { name: 'ifcsheet_open_model', arguments: { ifc_base64: 'A'.repeat(2_000_000) } }), { ...ON, maxModelBytes: 1024 });
    expect(res.status).toBe(413);
    expect(((await res.json()) as any).error.message).toContain('larger than the limit');
  });

  it('answers a malformed body with a JSON-RPC error, not an empty 202', async () => {
    for (const body of [null, 1, 'x', {}, []]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).error.code).toBe(-32600);
    }
    const res = await post([null]);
    expect(res.status).toBe(200);
    const out = (await res.json()) as any[];
    expect(out).toHaveLength(1);
    expect(out[0].error.code).toBe(-32600);
    expect(out[0].id).toBeNull();
    // Valid messages in a batch still answer next to an invalid one.
    const mixed = (await (await post([null, rpc(7, 'ping')])).json()) as any[];
    expect(mixed.map((r) => r.error?.code ?? r.id)).toEqual([-32600, 7]);
  });

  it('answers invalid JSON with -32700', async () => {
    const res = await handleHostedMcp(new Request('https://example.test/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' }), ON);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe(-32700);
  });

  it('caps a batch at 20 messages', async () => {
    const ok = await post(Array.from({ length: MAX_BATCH }, (_, i) => rpc(i + 1, 'ping')));
    expect(ok.status).toBe(200);
    expect((await ok.json()) as unknown[]).toHaveLength(MAX_BATCH);
    const res = await post(Array.from({ length: MAX_BATCH + 1 }, (_, i) => rpc(i + 1, 'ping')));
    expect(res.status).toBe(400);
    const err = ((await res.json()) as any).error;
    expect(err.code).toBe(-32600);
    expect(err.message).toContain('at most 20');
  });

  it('refuses a request whose Content-Length header is over the cap with 413, before reading the body', async () => {
    // The Request constructor drops a forged content-length; a plain object with the header exercises the branch.
    const forged = { method: 'POST', headers: new Headers({ 'content-length': '999999999' }), get body(): never { throw new Error('the body must not be read'); } } as unknown as Request;
    const res = await handleHostedMcp(forged, { ...ON, maxModelBytes: 1024 });
    expect(res.status).toBe(413);
    expect(((await res.json()) as any).error.code).toBe(-32600);
  });

  it.skipIf(missing !== null)('runs a batch in order: open_model, then a tool taking its model_id', async () => {
    const ifc_base64 = readFileSync(FZK).toString('base64');
    const res = await post([
      rpc(1, 'tools/call', { name: 'ifcsheet_open_model', arguments: { ifc_base64 } }),
      rpc(2, 'tools/call', { name: 'ifcsheet_generate_set', arguments: { model_id: 'sheetmodel-1' } }),
    ]);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { id: number; result: { isError?: boolean; structuredContent: any } }[];
    expect(out[0].result.isError).toBeFalsy();
    expect(out[0].result.structuredContent.model_id).toBe('sheetmodel-1');
    expect(out[1].result.isError).toBeFalsy();
    expect(out[1].result.structuredContent.sheets.length).toBeGreaterThan(0);
  });

  it.skipIf(missing !== null)('stops a request that runs past the wall time', async () => {
    const res = await post(rpc(2, 'tools/call', { name: 'ifcsheet_generate_set', arguments: { ifc_base64: readFileSync(FZK).toString('base64') } }), { ...ON, maxMs: 1 });
    expect(res.status).toBe(504);
    expect(((await res.json()) as any).error.message).toContain('stopped');
  });

  it.skipIf(missing !== null)('lays out the set of AC20-FZK-Haus passed in the request (#165)', async () => {
    const ifc_base64 = readFileSync(FZK).toString('base64');
    const result = await call('ifcsheet_generate_set', { ifc_base64 });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.sheets.length).toBeGreaterThan(0);
    expect(result.structuredContent.sheets[0].number).toBe('A-101');
  });
});
