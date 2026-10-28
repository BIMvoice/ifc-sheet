/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet_undo` / `ifcsheet_redo` (#165) over the stdio transport on
 * AC20-FZK-Haus. The project document is read back with `ifcsheet_save_project`
 * and compared whole.
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
import { MAX_HISTORY, newHistory, recordEdit, redoEdit, undoEdit } from './ifcsheet-history.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const CLI = fileURLToPath(new URL('../../../ifcsheet/dist/cli.js', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(CLI) ? 'the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`' : null;
if (missing) console.warn(`[mcp] skipping the ifcsheet undo tests: ${missing}`);

type Reply = { result?: { isError?: boolean; structuredContent?: any; content?: any[]; tools?: any[] } };

describe('history', () => {
  const fake = () => ({ set: { n: 0 } as any, schedules: [] as any[], history: newHistory() });
  const edit = (e: ReturnType<typeof fake>) => { recordEdit(e); e.set = { n: e.set.n + 1 }; };
  it('undoes, redoes, and a new edit clears redo', () => {
    const e = fake();
    edit(e); edit(e);
    expect(undoEdit(e)).toBe(true);
    expect(e.set.n).toBe(1);
    expect(redoEdit(e)).toBe(true);
    expect(e.set.n).toBe(2);
    undoEdit(e);
    edit(e);
    expect(e.set.n).toBe(2);
    expect(redoEdit(e)).toBe(false);
  });
  it('keeps a bounded number of edits', () => {
    const e = fake();
    for (let i = 0; i < MAX_HISTORY + 5; i++) edit(e);
    let steps = 0;
    while (undoEdit(e)) steps++;
    expect(steps).toBe(MAX_HISTORY);
    expect(e.set.n).toBe(5);
  });
});

describe.skipIf(missing !== null)('ifcsheet_undo over stdio on AC20-FZK-Haus', () => {
  let tmp: string;
  let stdin: PassThrough;
  let transport: StdioTransport;
  let nextId = 1;
  let modelId: string;
  const waiting = new Map<number, (r: Reply & { id: number }) => void>();

  const call = (method: string, params?: unknown): Promise<Reply> => {
    const id = nextId++;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  };
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = (await call('tools/call', { name, arguments: args })).result!;
    expect(r.isError, `${name}: ${JSON.stringify(r.content)}`).toBeFalsy();
    return r.structuredContent;
  };
  const generate = async () => (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;
  let saves = 0;
  /** The whole project document as the session holds it now (without the time it was written). */
  const snapshot = async (document_id: string) => {
    const file_path = join(tmp, `p${saves++}.json`);
    await ok('ifcsheet_save_project', { document_id, file_path });
    const { savedAt: _stamp, ...project } = JSON.parse(await readFile(file_path, 'utf8'));
    return project;
  };

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-undo-')));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-undo-test', version: '0' } });
    modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('two edits then one undo restore the state after the first edit exactly; redo brings the second back', async () => {
    const document_id = await generate();
    await ok('ifcsheet_set_title_block', { document_id, fields: { client: 'Muster AG' } });
    const afterFirst = await snapshot(document_id);
    await ok('ifcsheet_add_view', { document_id, kind: 'section', axis: 'front', name: 'Long section' });
    const afterSecond = await snapshot(document_id);
    expect(afterSecond).not.toEqual(afterFirst);

    const undone = await ok('ifcsheet_undo', { document_id });
    expect(undone).toMatchObject({ changed: true, undo_steps: 1, redo_steps: 1 });
    expect(await snapshot(document_id)).toEqual(afterFirst);

    expect(await ok('ifcsheet_redo', { document_id })).toMatchObject({ changed: true, undo_steps: 2, redo_steps: 0 });
    expect(await snapshot(document_id)).toEqual(afterSecond);
  }, 300_000);

  it('undoes a schedule sheet and a renumber, back to the generated set', async () => {
    const document_id = await generate();
    const generated = await snapshot(document_id);
    await ok('ifcsheet_add_schedule', { document_id, kind: 'rooms' });
    await ok('ifcsheet_renumber', { document_id, preset: 'sequential' });
    await ok('ifcsheet_undo', { document_id });
    await ok('ifcsheet_undo', { document_id });
    expect(await snapshot(document_id)).toEqual(generated);
    expect((await ok('ifcsheet_list_sheets', { document_id })).sheets.map((s: any) => s.number)).toEqual(['A-101', 'A-201', 'A-202', 'A-301']);
  }, 300_000);

  it('undo after a dry run does nothing extra: the dry run is not in the history', async () => {
    const document_id = await generate();
    await ok('ifcsheet_set_title_block', { document_id, fields: { client: 'Muster AG' } });
    const afterEdit = await snapshot(document_id);
    await ok('ifcsheet_set_title_block', { document_id, fields: { client: 'Other' }, dry_run: true });
    await ok('ifcsheet_add_view', { document_id, kind: 'section', axis: 'front', dry_run: true });
    await ok('ifcsheet_renumber', { document_id, preset: 'sequential', dry_run: true });
    expect(await snapshot(document_id)).toEqual(afterEdit);
    expect(await ok('ifcsheet_undo', { document_id })).toMatchObject({ changed: true, undo_steps: 0 });
    expect((await snapshot(document_id)).titleBlock?.client).not.toBe('Muster AG');
    expect(await ok('ifcsheet_undo', { document_id })).toMatchObject({ changed: false });
  }, 300_000);

  it('undo on an empty history says so and is not an error; so is redo', async () => {
    const document_id = await generate();
    const before = await snapshot(document_id);
    const undo = await ok('ifcsheet_undo', { document_id });
    expect(undo).toMatchObject({ changed: false, undo_steps: 0, redo_steps: 0 });
    const reply = (await call('tools/call', { name: 'ifcsheet_undo', arguments: { document_id } })).result!;
    expect(reply.content![0].text).toMatch(/Nothing to undo/);
    expect(await ok('ifcsheet_redo', { document_id })).toMatchObject({ changed: false });
    expect(await snapshot(document_id)).toEqual(before);
  }, 300_000);

  it('a failed edit leaves no history, and a new edit after an undo clears redo', async () => {
    const document_id = await generate();
    const failed = (await call('tools/call', { name: 'ifcsheet_place_view', arguments: { document_id, view: 'no such view' } })).result!;
    expect(failed.isError).toBe(true);
    expect(await ok('ifcsheet_undo', { document_id })).toMatchObject({ changed: false });

    await ok('ifcsheet_set_title_block', { document_id, fields: { client: 'A' } });
    await ok('ifcsheet_undo', { document_id });
    await ok('ifcsheet_set_title_block', { document_id, fields: { client: 'B' } });
    expect(await ok('ifcsheet_redo', { document_id })).toMatchObject({ changed: false });
    expect((await snapshot(document_id)).titleBlock?.client).toBe('B');
  }, 300_000);

  it('advertises both tools', async () => {
    const names = (await call('tools/list')).result!.tools!.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['ifcsheet_undo', 'ifcsheet_redo']));
  });
});
