/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two sessions on one cached model. The cache hands every session the same
 * parsed model, so a tool that wrote to it would leak state from one session
 * into the other. Every edit belongs to the session's own document, rebuilt
 * from its token; this test interleaves two sessions and checks that the
 * model, and the other session's document and PDF, did not move.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { serializeSetTemplate, type SetTemplate } from '@bimvoice/ifcsheet';
import { handleHostedMcp, type HostedOptions } from './hosted.js';
import { verifyToken } from './hosted-session.js';
import { deepFreeze, hostedModelCache, sha256Hex } from '../tools/hosted-model-cache.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[mcp] skipping the hosted session share tests: ${missing}`);

const SECRET = 's3cret-'.repeat(8);
const NOW = 1_800_000_000_000;
const ON = (): HostedOptions => ({ env: { IFCSHEET_HOSTED_MCP: '1', IFCSHEET_HOSTED_MCP_SECRET: SECRET }, now: () => NOW });
const bytes = () => readFileSync(FZK);
const ifc_base64 = () => bytes().toString('base64');

const call = async (name: string, args: Record<string, unknown>) => {
  const res = await handleHostedMcp(new Request('https://example.test/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }),
  }), ON());
  expect(res.status).toBe(200);
  const out = ((await res.json()) as { result: { isError?: boolean; structuredContent?: any } }).result;
  expect(out.isError, `${name}: ${JSON.stringify(out.structuredContent)}`).toBeFalsy();
  return out.structuredContent;
};

/** One session: the token and the ids its calls name, carried from call to call as a client does. */
function session() {
  const s = { token: '', model_id: '', document_id: '' };
  return {
    s,
    async run(name: string, args: Record<string, unknown> = {}) {
      const out = await call(name, { ...args, ...(s.token ? { session_token: s.token } : {}), ...(s.model_id && name !== 'ifcsheet_open_model' ? { ifc_base64: ifc_base64() } : {}) });
      s.token = out.session_token ?? s.token;
      s.model_id = out.model_id ?? s.model_id;
      s.document_id = out.document_id ?? s.document_id;
      return out;
    },
  };
}

/** A hash of what the tools read from a cached model: the plain data, and the bytes of every mesh buffer. */
function modelHash(model: any): string {
  const h = createHash('sha256');
  h.update(JSON.stringify({ projectName: model.projectName, storeys: model.storeys, extent: model.extent, farElements: model.farElements, includeFarElements: model.includeFarElements }));
  for (const list of [model.meshes, model.buildingMeshes]) {
    h.update(`|${list.length}|`);
    for (const mesh of list) {
      for (const [key, value] of Object.entries(mesh)) {
        h.update(key);
        if (ArrayBuffer.isView(value)) h.update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        else h.update(JSON.stringify(value) ?? '');
      }
    }
  }
  return h.digest('hex');
}

/** The PDF's bytes without its random file /ID and its creation time, the two things that differ between two exports of one set. */
const pdfBytes = (base64: string): string => Buffer.from(base64, 'base64').toString('latin1').replace(/\/ID \[[^\]]*\]/, '/ID []').replace(/\/CreationDate \([^)]*\)/, '/CreationDate ()');

const documentOf = (token: string) => JSON.stringify(verifyToken(token, SECRET, NOW).sets.map((x) => x.set.document));

const TEMPLATE: SetTemplate = {
  name: 'Share', annotations: {}, schedules: [],
  sheets: [{ name: 'Plans', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [{ view: { kind: 'plan' as const, storey: 0 }, scale: 200 }] }],
};

beforeEach(() => { hostedModelCache.cache.clear(); });

describe('deepFreeze', () => {
  it('freezes plain objects and arrays at any depth, and leaves typed arrays, class instances and skipped fields alone', () => {
    const typed = new Float32Array(3);
    const map = new Map([[1, 2]]);
    const live = { n: 1 };
    const frozen = deepFreeze({ a: [{ b: { c: 1 } }], typed, map, live }, new Set(['live']));
    expect(Object.isFrozen(frozen) && Object.isFrozen(frozen.a) && Object.isFrozen(frozen.a[0].b)).toBe(true);
    expect(Object.isFrozen(typed)).toBe(false);
    expect(Object.isFrozen(map)).toBe(false);
    expect(Object.isFrozen(live)).toBe(false);
    expect(() => { 'use strict'; (frozen.a[0].b as any).c = 2; }).toThrow(TypeError);
  });
});

describe.skipIf(missing !== null)('hosted MCP sessions: one cached model, two sessions', () => {
  it('keeps the model, and the other session\'s document and PDF, unchanged while a session edits', async () => {
    const A = session();
    const B = session();
    await A.run('ifcsheet_open_model', { ifc_base64: ifc_base64() });
    await B.run('ifcsheet_open_model', { ifc_base64: ifc_base64() });
    await A.run('ifcsheet_generate_set', { model_id: A.s.model_id });
    await B.run('ifcsheet_generate_set', { model_id: B.s.model_id });

    const cached: any = hostedModelCache.cache.get(sha256Hex(bytes()));
    expect(cached, 'both sessions share one cached model').toBeDefined();
    expect(Object.isFrozen(cached) && Object.isFrozen(cached.storeys) && Object.isFrozen(cached.extent)).toBe(true);
    const modelBefore = modelHash(cached);
    const docBefore = documentOf(B.s.token);
    const pdfBefore = await B.run('ifcsheet_export_pdf', { document_id: B.s.document_id });

    const editing = async () => {
      await A.run('ifcsheet_set_title_block', { document_id: A.s.document_id, fields: { client: 'Only in A' } });
      await A.run('ifcsheet_add_view', { document_id: A.s.document_id, kind: 'section', axis: 'front', name: 'Only in A' });
      await A.run('ifcsheet_renumber', { document_id: A.s.document_id, preset: 'sequential' });
      await A.run('ifcsheet_apply_template', { model_id: A.s.model_id, template_json: serializeSetTemplate(TEMPLATE) });
    };
    const reading = async () => {
      await B.run('ifcsheet_export_pdf', { document_id: B.s.document_id });
      await B.run('ifcsheet_check_readiness', { model_id: B.s.model_id });
      return B.run('ifcsheet_export_pdf', { document_id: B.s.document_id });
    };
    const [, pdfAfter] = await Promise.all([editing(), reading()]);

    expect(documentOf(A.s.token)).toContain('Only in A'); // the edits did land, in A's own document
    expect(documentOf(B.s.token)).toBe(docBefore);
    expect(documentOf(B.s.token)).not.toContain('Only in A');
    expect(pdfBytes(pdfAfter.pdf_base64)).toBe(pdfBytes(pdfBefore.pdf_base64));
    expect(hostedModelCache.cache.get(sha256Hex(bytes()))).toBe(cached);
    expect(modelHash(cached)).toBe(modelBefore);
  }, 300_000);
});
