/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine (#78) through the drawing-set tools, end to end over the stdio transport on AC20-FZK-Haus:
 * `ifcsheet_add_schedule` with `kind: "list"` runs the definition over the engine's headless provider, the issue's CSV is the file
 * `ifcsheet list` writes for the same definition, a saved project keeps the schedule, and a malformed definition is refused with the reason.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { createMCPServer } from '../index.js';
import { StdioTransport } from '../transport/stdio.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const ENGINE = new URL('../../../ifcsheet/', import.meta.url);
const CLI = fileURLToPath(new URL((JSON.parse(readFileSync(new URL('package.json', ENGINE), 'utf8')) as { bin: { ifcsheet: string } }).bin.ifcsheet, ENGINE));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(CLI) ? 'the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`' : null;
if (missing) console.warn(`[mcp] skipping the ifcsheet list schedule tests: ${missing}`);

type Reply = { result?: { isError?: boolean; structuredContent?: any; content?: { text: string }[] }; error?: unknown };
const cli = (...args: string[]) => promisify(execFile)(process.execPath, [CLI, ...args], { maxBuffer: 64 * 1024 * 1024 });

const WALLS_BY_TYPE = {
  filter: { classes: ['IfcWallStandardCase'] },
  columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
  groupBy: ['type'], sum: ['area'],
};

describe.skipIf(missing !== null)('ifcsheet_add_schedule kind "list" over stdio on AC20-FZK-Haus', () => {
  let tmp: string;
  let stdin: PassThrough;
  let transport: StdioTransport;
  let nextId = 1;
  let modelId: string;
  const waiting = new Map<number, (r: Reply) => void>();
  const call = (method: string, params?: unknown): Promise<Reply> => {
    const id = nextId++;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  };
  const tool = async (name: string, args: Record<string, unknown>) => (await call('tools/call', { name, arguments: args })).result!;
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = await tool(name, args);
    expect(r.isError, `${name}: ${JSON.stringify(r.content)}`).toBeFalsy();
    return r.structuredContent;
  };
  const refused = async (name: string, args: Record<string, unknown>, message: RegExp) => {
    const r = await tool(name, args);
    expect(r.isError, `${name} ${JSON.stringify(args)} should be refused`).toBe(true);
    expect(`${r.structuredContent?.message ?? r.content?.[0]?.text ?? ''} ${JSON.stringify(r.structuredContent?.details ?? {})}`).toMatch(message);
  };
  const generate = async () => (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-list-')));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-list-test', version: '0' } });
    modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('adds the walls by type with the Lists engine\'s counts and totals, and issues the CSV `ifcsheet list` writes', async () => {
    const document_id = await generate();
    const added = await ok('ifcsheet_add_schedule', { document_id, kind: 'list', name: 'Walls by type', list: WALLS_BY_TYPE });
    expect(added.kind).toBe('list');
    expect(added.table[0]).toEqual(['Type', 'Count', 'NetSideArea (m²)']);
    expect(added.rows).toBe(3);
    const totals = added.table[3];
    expect(totals.slice(0, 2)).toEqual(['Total', '13']);
    expect(Number(totals[2])).toBeCloseTo(190.4655, 4);
    expect(added.table.slice(1, 3).map((r: string[]) => Number(Number(r[2]).toFixed(4))).sort((a: number, b: number) => b - a)).toEqual([136.2761, 54.1895]);

    const project = join(tmp, 'p.ifclite-project.json');
    await writeFile(project, JSON.stringify({ format: 'ifclite-project', version: 1, schedules: [{ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 1, list: WALLS_BY_TYPE }] }));
    const issued = await ok('ifcsheet_issue_set', { document_id, directory: join(tmp, 'issue') });
    expect(issued.files.some((f: any) => f.kind === 'schedule')).toBe(true);
    expect(await readFile(join(tmp, 'issue', 'schedules', 'A-601.csv'), 'utf8')).toBe((await cli('list', FZK, '--project', project, '--csv')).stdout);
  }, 300_000);

  it('words the table in Romanian and writes the ; CSV, as `ifcsheet list --locale ro`', async () => {
    const document_id = await generate();
    const added = await ok('ifcsheet_add_schedule', { document_id, kind: 'list', locale: 'ro', list: WALLS_BY_TYPE });
    expect(added.table[0]).toEqual(['Type', 'Număr', 'NetSideArea (m²)']);
    const project = join(tmp, 'ro.ifclite-project.json');
    await writeFile(project, JSON.stringify({ format: 'ifclite-project', version: 1, schedules: [{ id: 'walls', name: 'Schedule', kind: 'list', createdAt: 1, list: WALLS_BY_TYPE }] }));
    await ok('ifcsheet_issue_set', { document_id, directory: join(tmp, 'issue-ro') });
    expect(await readFile(join(tmp, 'issue-ro', 'schedules', 'A-601.csv'), 'utf8')).toBe((await cli('list', FZK, '--project', project, '--csv', '--locale', 'ro')).stdout);
  }, 300_000);

  it('a dry run adds no sheet; a saved project keeps the schedule and a loaded one draws it again', async () => {
    const document_id = await generate();
    const before = (await ok('ifcsheet_list_sheets', { document_id })).sheets.length;
    const dry = await ok('ifcsheet_add_schedule', { document_id, kind: 'list', list: WALLS_BY_TYPE, dry_run: true });
    expect(dry.dry_run).toBe(true);
    expect((await ok('ifcsheet_list_sheets', { document_id })).sheets).toHaveLength(before);
    await ok('ifcsheet_add_schedule', { document_id, kind: 'list', list: WALLS_BY_TYPE });
    const file = join(tmp, 'saved.ifclite-project.json');
    await ok('ifcsheet_save_project', { document_id, file_path: file });
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.ifcsheetSchedules[0]).toMatchObject({ kind: 'list', list: WALLS_BY_TYPE });
    const loaded = await ok('ifcsheet_load_project', { model_id: modelId, project_path: file });
    expect(loaded.dropped).toBeUndefined();
    await ok('ifcsheet_issue_set', { document_id: loaded.document_id, directory: join(tmp, 'issue-loaded') });
    expect(await readFile(join(tmp, 'issue-loaded', 'schedules', 'A-601.csv'), 'utf8')).toContain('Total,13,190.4655');
  }, 300_000);

  it('refuses a definition it would have to change, and says which part', async () => {
    const document_id = await generate();
    const add = (list: unknown, extra: Record<string, unknown> = {}) => ({ document_id, kind: 'list', ...(list === undefined ? {} : { list }), ...extra });
    await refused('ifcsheet_add_schedule', add(undefined), /list is required for kind "list"/);
    await refused('ifcsheet_add_schedule', add('columns'), /\$\.list/);
    await refused('ifcsheet_add_schedule', add({}), /list\.columns must hold at least one column/);
    await refused('ifcsheet_add_schedule', add({ columns: [{ id: 'a', source: 'magic', propertyName: 'Name' }] }), /list\.columns\[0\] cannot be used/);
    await refused('ifcsheet_add_schedule', add({ columns: [{ id: 'a', source: 'attribute', propertyName: 'Name' }, { id: 'a', source: 'attribute', propertyName: 'Tag' }] }), /list\.columns\[1\] cannot be used/);
    await refused('ifcsheet_add_schedule', add({ columns: WALLS_BY_TYPE.columns, groupBy: ['nope'] }), /list\.groupBy must name distinct column ids/);
    await refused('ifcsheet_add_schedule', add({ columns: WALLS_BY_TYPE.columns, sum: ['area'] }), /list\.sum must name distinct column ids/);
    await refused('ifcsheet_add_schedule', add({ ...WALLS_BY_TYPE, totals: true }), /list\.totals can only be false/);
    await refused('ifcsheet_add_schedule', add({ ...WALLS_BY_TYPE, filter: { classes: ['IfcNoSuchThing'] } }), /no row|no element of the model matches/);
    await refused('ifcsheet_add_schedule', { document_id, kind: 'rooms', list: WALLS_BY_TYPE }, /for kind "list"/);
    await refused('ifcsheet_add_schedule', add(WALLS_BY_TYPE, { project_json: '{}' }), /for kind "boq"/);
    expect((await ok('ifcsheet_list_sheets', { document_id })).sheets.some((s: any) => s.number === 'A-601')).toBe(false);
  }, 300_000);
});
