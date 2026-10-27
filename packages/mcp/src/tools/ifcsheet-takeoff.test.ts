/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The quantity-takeoff tools (`ifcsheet_rooms`, `_materials`, `_boq`, `_list`, `_classify`) over the stdio transport on AC20-FZK-Haus: each
 * result equals what the command of the same name prints for the same model and project (`--json`, the text and the CSV), a comma project
 * formats the text as the command does, a quantity the model lacks is null, and bad input is refused cleanly.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
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
if (missing) console.warn(`[mcp] skipping the ifcsheet takeoff tests: ${missing}`);

type Reply = { result?: { isError?: boolean; structuredContent?: any; content?: { text: string }[] }; error?: unknown };
/** The command's stdout, without the geometry engine's own `[IFC-LITE]` log lines, which go to the same stream. */
const cli = async (...args: string[]) => {
  const { stdout } = await promisify(execFile)(process.execPath, [CLI, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return { stdout: stdout.split('\n').filter((l) => !l.startsWith('[IFC-LITE]') && !/^  Ifc\w+: hosts=/.test(l)).join('\n') };
};

const WALLS_BY_TYPE = {
  filter: { classes: ['IfcWallStandardCase'] },
  columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
  groupBy: ['type'], sum: ['area'],
};
const MAPPING = { id: 'uc', system: { name: 'Uniclass', edition: '2015' }, rules: [{ by: 'type', match: 'Leichtbeton 102890359 240', code: 'EXAMPLE-Ss_25_10', title: 'EXAMPLE: thick walls' }] };
const PROJECT = {
  format: 'ifclite-project', version: 1,
  unitsAndNumbers: { separator: 'comma', decimals: { area: 3 } },
  schedules: [{ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 1, list: WALLS_BY_TYPE }],
  classificationMappings: [MAPPING],
  boqArticles: [
    { id: 'b1', code: 'EX-01', description: 'Walls 240', unit: 'm3', quantity: 'NetVolume', factor: 1, typeName: 'Leichtbeton 102890359 240' },
    { id: 'b2', code: 'EX-02', description: 'Slab area', unit: 'm2', quantity: 'NetArea', factor: 1.5, waste: 5, filter: { classes: ['IfcSlab'] } },
    { id: 'b3', code: 'EX-03', description: 'Doors by count', unit: 'buc', quantity: 'Count', factor: 1, filter: { classes: ['IfcDoor'] } },
    { id: 'b4', code: 'EX-04', description: 'Door areas', unit: 'm2', quantity: 'Area', factor: 1, filter: { classes: ['IfcDoor'] } },
    { id: 'b5', code: 'EX-05', description: 'Nothing here', unit: 'm3', quantity: 'NetVolume', factor: 1, filter: { classes: ['IfcRailing'] } },
  ],
};

describe.skipIf(missing !== null)('the quantity-takeoff tools over stdio on AC20-FZK-Haus', () => {
  let tmp: string;
  let stdin: PassThrough;
  let transport: StdioTransport;
  let nextId = 1;
  let modelId: string;
  let project: string;
  let comma: string;
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
  /** What the tool returns apart from the text and the CSV: the values `--json` prints. */
  const jsonOf = ({ model_id, text, csv, units, refused: _r, ...json }: any, keepRefused = false) => (keepRefused ? { ...json, refused: _r } : json);
  const parsed = async (...args: string[]) => JSON.parse((await cli(...args)).stdout);

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-takeoff-')));
    project = join(tmp, 'p.ifclite-project.json');
    comma = join(tmp, 'comma.ifclite-project.json');
    await writeFile(project, JSON.stringify({ ...PROJECT, unitsAndNumbers: undefined }));
    await writeFile(comma, JSON.stringify(PROJECT));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-takeoff-test', version: '0' } });
    modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('ifcsheet_rooms equals `ifcsheet rooms`: --json, the text and the CSV', async () => {
    const r = await ok('ifcsheet_rooms', { model_id: modelId });
    expect(jsonOf(r)).toEqual(await parsed('rooms', FZK, '--json'));
    expect(r.text).toBe((await cli('rooms', FZK)).stdout);
    expect(`${r.csv}\n`).toBe((await cli('rooms', FZK, '--csv')).stdout);
    expect(r.units).toEqual({ area: 'm²', perimeter: 'm' });
    expect(r.rooms).toBeGreaterThan(0);
    expect(typeof r.total).toBe('number');
    for (const l of r.levels) for (const room of l.rooms) expect(room.area === null || typeof room.area === 'number').toBe(true);
    // The model's set names the same model.
    const document_id = (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id;
    expect(jsonOf(await ok('ifcsheet_rooms', { document_id }))).toEqual(jsonOf(r));
  }, 300_000);

  it('a comma project formats the text as the command does, and leaves the numbers plain', async () => {
    const r = await ok('ifcsheet_rooms', { model_id: modelId, project_path: comma });
    expect(r.text).toBe((await cli('rooms', FZK, '--project', comma)).stdout);
    expect(r.text).not.toBe((await ok('ifcsheet_rooms', { model_id: modelId })).text);
    expect(r.text).toMatch(/\d,\d{3}\b/);
    expect(typeof r.total).toBe('number');
    const inline = await ok('ifcsheet_rooms', { model_id: modelId, project_json: JSON.stringify(PROJECT) });
    expect(inline.text).toBe(r.text);
    const b = await ok('ifcsheet_boq', { model_id: modelId, project_path: comma });
    expect(b.text).toBe((await cli('boq', FZK, '--project', comma)).stdout);
  }, 300_000);

  it('ifcsheet_materials equals `ifcsheet materials`, alone and with a project', async () => {
    const alone = await ok('ifcsheet_materials', { model_id: modelId });
    expect(jsonOf(alone)).toEqual(await parsed('materials', FZK, '--json'));
    expect(alone.text).toBe((await cli('materials', FZK)).stdout);
    expect(alone.materials.length).toBeGreaterThan(0);
    const withProject = await ok('ifcsheet_materials', { model_id: modelId, project_path: project });
    expect(jsonOf(withProject)).toEqual(await parsed('materials', FZK, '--project', project, '--json'));
  }, 300_000);

  it('ifcsheet_boq equals `ifcsheet boq` (--json, text, detail text, CSV, Romanian) and a missing quantity is null, never 0', async () => {
    const args = { model_id: modelId, project_path: project };
    const r = await ok('ifcsheet_boq', args);
    expect(jsonOf(r, false)).toEqual(await parsed('boq', FZK, '--project', project, '--json'));
    expect(r.text).toBe((await cli('boq', FZK, '--project', project)).stdout);
    expect(r.csv).toBe((await cli('boq', FZK, '--project', project, '--csv')).stdout);
    const detail = await ok('ifcsheet_boq', { ...args, detail: true });
    expect(detail.text).toBe((await cli('boq', FZK, '--project', project, '--detail')).stdout);
    const ro = await ok('ifcsheet_boq', { ...args, locale: 'ro' });
    expect(ro.csv).toBe((await cli('boq', FZK, '--project', project, '--csv', '--locale', 'ro')).stdout);
    const [walls, , doors, doorAreas, railings] = r.articles;
    expect(typeof walls.total).toBe('number');
    expect(walls.unit).toBe('m³');
    expect(doors.total).toBe(doors.matched);
    expect(typeof doorAreas.total).toBe('number');
    // Railings match but none declares NetVolume: the total is null and the elements are named, not 0.
    expect(railings.matched).toBeGreaterThan(0);
    expect(railings.total).toBeNull();
    expect(railings.missing).toHaveLength(railings.matched);
    expect(railings.missing[0]).toMatchObject({ ifcClass: 'IfcRailing' });
    expect(r.refused).toBe(false);
  }, 300_000);

  it('ifcsheet_list equals `ifcsheet list`: --json, text, CSV and the comma format', async () => {
    const r = await ok('ifcsheet_list', { model_id: modelId, project_path: project });
    expect(jsonOf(r)).toEqual(await parsed('list', FZK, '--project', project, '--json'));
    expect(r.text).toBe((await cli('list', FZK, '--project', project)).stdout);
    expect(r.csv).toBe((await cli('list', FZK, '--project', project, '--csv')).stdout);
    expect(r.header).toEqual(['Type', 'Count', 'NetSideArea (m²)']);
    expect(r.totals.slice(0, 2)).toEqual(['Total', 13]);
    expect(r.totals[2]).toBeCloseTo(190.4655, 4);
    const c = await ok('ifcsheet_list', { model_id: modelId, project_path: comma, schedule: 'Walls by type' });
    expect(c.text).toBe((await cli('list', FZK, '--project', comma, '--schedule', 'Walls by type')).stdout);
    expect(c.text).not.toBe(r.text);
  }, 300_000);

  it('ifcsheet_classify equals `ifcsheet classify`', async () => {
    const r = await ok('ifcsheet_classify', { model_id: modelId, project_path: project });
    expect(jsonOf(r)).toEqual(await parsed('classify', FZK, '--project', project, '--json'));
    expect(r.text).toBe((await cli('classify', FZK, '--project', project)).stdout);
    expect(r.csv).toBe((await cli('classify', FZK, '--project', project, '--csv')).stdout);
    expect(r.types.some((t: any) => t.code === 'EXAMPLE-Ss_25_10')).toBe(true);
    expect(r.types.some((t: any) => t.code === null && t.source === 'none')).toBe(true);
    const named = await ok('ifcsheet_classify', { model_id: modelId, project_json: JSON.stringify(PROJECT), system: 'Uniclass' });
    expect(named.types).toEqual(r.types);
  }, 300_000);

  it('refuses unknown ids, a missing or unusable project and an unknown schedule or system, and changes nothing', async () => {
    await refused('ifcsheet_rooms', { model_id: 'sheetmodel-99' }, /No drawing-set model 'sheetmodel-99'/);
    await refused('ifcsheet_boq', { document_id: 'sheetset-99', project_path: project }, /No drawing set 'sheetset-99'/);
    await refused('ifcsheet_materials', {}, /exactly one of model_id/);
    await refused('ifcsheet_materials', { model_id: modelId, document_id: 'sheetset-1' }, /exactly one of model_id/);
    for (const name of ['ifcsheet_boq', 'ifcsheet_list', 'ifcsheet_classify']) {
      await refused(name, { model_id: modelId }, /exactly one of project_path/);
      await refused(name, { model_id: modelId, project_json: '{}' }, /cannot be used as a project/);
      await refused(name, { model_id: modelId, project_path: join(tmp, 'absent.json') }, /does not exist|outside the allowed|Cannot read/);
    }
    const empty = JSON.stringify({ format: 'ifclite-project', version: 1 });
    await refused('ifcsheet_boq', { model_id: modelId, project_json: empty }, /holds no bill-of-quantities articles/);
    await refused('ifcsheet_list', { model_id: modelId, project_json: empty }, /holds no list schedules/);
    await refused('ifcsheet_list', { model_id: modelId, project_path: project, schedule: 'nope' }, /no list schedule "nope"/);
    await refused('ifcsheet_classify', { model_id: modelId, project_json: empty }, /no classification mapping/);
    await refused('ifcsheet_classify', { model_id: modelId, project_path: project, system: 'Omniclass' }, /no classification system "Omniclass"/);
    await refused('ifcsheet_rooms', { model_id: modelId, locale: 'fr' }, /Expected one of \[\\"en\\",\\"ro\\"\]/);
  }, 300_000);
});
