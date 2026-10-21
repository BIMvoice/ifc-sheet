/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The first slice of the drawing-set tools (#165), end to end over the stdio
 * transport (newline-delimited JSON-RPC on in-memory streams) on
 * AC20-FZK-Haus: open the model, lay out its set, write the PDF. The model is
 * opened once for the file; the error cases need no model.
 */

import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { createMCPServer } from '../index.js';
import { StdioTransport } from '../transport/stdio.js';

// The copy committed with the viewer's test fixtures, the one the engine's own tests read.
const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[mcp] skipping the ifcsheet tool tests: ${missing}`);

type Reply = { result?: { isError?: boolean; structuredContent?: any; content?: { text: string }[]; tools?: any[] }; error?: unknown };

describe.skipIf(missing !== null)('ifcsheet_* tools over stdio on AC20-FZK-Haus', () => {
  let tmp: string;
  let stdin: PassThrough;
  let transport: StdioTransport;
  let nextId = 1;
  const waiting = new Map<number, (r: Reply) => void>();

  const call = (method: string, params?: unknown): Promise<Reply> => {
    const id = nextId++;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  };
  const tool = async (name: string, args: Record<string, unknown>) => (await call('tools/call', { name, arguments: args })).result!;

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-')));
    stdin = new PassThrough();
    const stdout = new PassThrough();
    let buffer = '';
    stdout.setEncoding('utf8');
    stdout.on('data', (chunk: string) => {
      buffer += chunk;
      for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
        const msg = JSON.parse(buffer.slice(0, nl)) as Reply & { id: number };
        buffer = buffer.slice(nl + 1);
        waiting.get(msg.id)?.(msg);
        waiting.delete(msg.id);
      }
    });
    transport = new StdioTransport({ stdin, stdout, stderr: new PassThrough() });
    await transport.connect(createMCPServer({ version: '0.0.0-test', config: { allowedPaths: [dirname(FZK), tmp] } }));
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-test', version: '0' } });
  });

  afterAll(async () => {
    transport.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it('advertises the four tools with a described input schema', async () => {
    const tools = (await call('tools/list')).result!.tools!.filter((t) => t.name.startsWith('ifcsheet_'));
    expect(tools.map((t) => t.name).sort()).toEqual(['ifcsheet_check_readiness', 'ifcsheet_export_pdf', 'ifcsheet_generate_set', 'ifcsheet_open_model']);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe('object');
    }
    expect(tools.find((t) => t.name === 'ifcsheet_export_pdf').inputSchema.required).toEqual(['document_id']);
  });

  it('opens the model, lays out the four-sheet set and writes a four-page PDF', async () => {
    const opened = await tool('ifcsheet_open_model', { file_path: FZK });
    expect(opened.isError, JSON.stringify(opened.content)).toBeFalsy();
    const summary = opened.structuredContent;
    expect(summary.model_id).toMatch(/^sheetmodel-/);
    expect(summary.storeys.map((s: { name: string }) => s.name)).toEqual(['Erdgeschoss', 'Dachgeschoss']);
    expect(summary.storeyCount).toBe(2);
    expect(summary.elementCount).toBeGreaterThan(100);
    expect(summary.hasGeometry).toBe(true);
    expect(typeof summary.projectName).toBe('string');

    const generated = await tool('ifcsheet_generate_set', { model_id: summary.model_id });
    expect(generated.isError).toBeFalsy();
    const set = generated.structuredContent;
    expect(set.document_id).toMatch(/^sheetset-/);
    expect(set.sheets.map((s: { number: string }) => s.number)).toEqual(['A-101', 'A-201', 'A-202', 'A-301']);
    expect(set.sheets.map((s: { name: string }) => s.name)).toEqual(['Floor plans', 'Elevations, south and north', 'Elevations, east and west', 'Sections']);
    expect(set.sheets.every((s: { paper: string }) => typeof s.paper === 'string' && s.paper.length > 0)).toBe(true);
    expect(set.sheets[0].viewports.map((v: { view: string }) => v.view)).toEqual(['Erdgeschoss', 'Dachgeschoss']);
    const plans = set.views.filter((v: { kind: string }) => v.kind === 'plan');
    expect(plans.map((v: { level: string }) => v.level).sort()).toEqual(['Dachgeschoss', 'Erdgeschoss']);
    expect(new Set(set.views.map((v: { kind: string }) => v.kind))).toEqual(new Set(['3d', 'plan', 'elevation', 'section']));
    expect(set.document.sheets).toHaveLength(4);

    const out = join(tmp, 'nested', 'fzk.pdf');
    const exported = await tool('ifcsheet_export_pdf', { document_id: set.document_id, file_path: out });
    expect(exported.isError).toBeFalsy();
    expect(exported.structuredContent).toMatchObject({ pages: 4, file_path: out, sheets: ['A-101', 'A-201', 'A-202', 'A-301'] });
    const bytes = await readFile(out);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBe(exported.structuredContent.bytes);
    expect((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(4);

    // Without file_path the same PDF comes back as base64.
    const inline = await tool('ifcsheet_export_pdf', { document_id: set.document_id });
    expect(Buffer.from(inline.structuredContent.pdf_base64, 'base64').subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(inline.structuredContent.pages).toBe(4);
  }, 120_000);

  it('reports what AC20-FZK-Haus lacks: four of 82 elements have no material, the same finding as `ifcsheet check`', async () => {
    const opened = await tool('ifcsheet_open_model', { file_path: FZK });
    const checked = await tool('ifcsheet_check_readiness', { model_id: opened.structuredContent.model_id });
    expect(checked.isError, JSON.stringify(checked.content)).toBeFalsy();
    expect(checked.structuredContent).toEqual({
      model_id: opened.structuredContent.model_id,
      ready: false,
      findings: [{ kind: 'noMaterials', missing: '4 of 82 elements have no material.', effect: expect.stringContaining('material takeoff'), params: { count: 4, total: 82 } }],
    });
    expect(checked.content![0].text).toContain('4 of 82 elements have no material.');
  }, 120_000);

  it('refuses an unknown handle with an error the agent can act on', async () => {
    const gen = await tool('ifcsheet_generate_set', { model_id: 'sheetmodel-999' });
    expect(gen.isError).toBe(true);
    expect(gen.structuredContent.code).toBe('MODEL_NOT_FOUND');
    expect(gen.structuredContent.message).toContain('ifcsheet_open_model');
    const check = await tool('ifcsheet_check_readiness', { model_id: 'sheetmodel-999' });
    expect(check.isError).toBe(true);
    expect(check.structuredContent.code).toBe('MODEL_NOT_FOUND');
    const pdf = await tool('ifcsheet_export_pdf', { document_id: 'sheetset-999', file_path: join(tmp, 'x.pdf') });
    expect(pdf.isError).toBe(true);
    expect(pdf.structuredContent.code).toBe('ENTITY_NOT_FOUND');
    expect(pdf.structuredContent.message).toContain('ifcsheet_generate_set');
  });

  it('refuses a missing file and a bad input shape', async () => {
    const missingFile = await tool('ifcsheet_open_model', { file_path: join(tmp, 'absent.ifc') });
    expect(missingFile.isError).toBe(true);
    expect(missingFile.structuredContent.message).toMatch(/no such file|not found|absent\.ifc/i);
    const both = await tool('ifcsheet_open_model', {});
    expect(both.isError).toBe(true);
    expect(both.structuredContent.message).toContain('exactly one');
    const unparsable = await tool('ifcsheet_open_model', { ifc_base64: Buffer.from('not an ifc file').toString('base64') });
    expect(unparsable.isError).toBe(true);
  });
});
