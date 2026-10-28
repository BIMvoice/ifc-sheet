/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The second slice of the drawing-set tools (#165), end to end over the stdio
 * transport on AC20-FZK-Haus: build and edit a set (views, placement, title
 * block, numbering, a room schedule), issue it, save and load the project; the
 * outputs against `ifcsheet` (the command line) for the same model; and every
 * tool's refusals.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serializeSetTemplate, type SetTemplate } from '@bimvoice/ifcsheet';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { createMCPServer } from '../index.js';
import { StdioTransport } from '../transport/stdio.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
// The command line, where the engine's package says its binary is.
const ENGINE = new URL('../../../ifcsheet/', import.meta.url);
const CLI = fileURLToPath(new URL((JSON.parse(readFileSync(new URL('package.json', ENGINE), 'utf8')) as { bin: { ifcsheet: string } }).bin.ifcsheet, ENGINE));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(CLI) ? 'the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`' : null;
if (missing) console.warn(`[mcp] skipping the ifcsheet set tool tests: ${missing}`);

type Reply = { result?: { isError?: boolean; structuredContent?: any; content?: { text: string }[]; tools?: any[] }; error?: unknown };
const pdfPages = (bytes: Buffer): number => (bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
/** The files of a ZIP (the local headers; deflate or stored). */
function unzip(zip: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50;) {
    const method = zip.readUInt16LE(at + 8);
    const size = zip.readUInt32LE(at + 18);
    const name = zip.toString('utf8', at + 30, at + 30 + zip.readUInt16LE(at + 26));
    const start = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
    const data = zip.subarray(start, start + size);
    out[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    at = start + size;
  }
  return out;
}
/** The command line's stdout without the geometry engine's log lines. */
const quiet = (out: string): string => out.split('\n').filter((l) => !l.startsWith('[') && !l.startsWith('  Ifc')).join('\n').trimEnd();
const cli = (...args: string[]) => promisify(execFile)(process.execPath, [CLI, ...args], { maxBuffer: 64 * 1024 * 1024 });

/** A template written by hand: the plans on A1 at 1:200, the sections on A2. */
const OFFICE: SetTemplate = {
  name: 'Office', annotations: {}, schedules: [],
  sheets: [
    { name: 'Office plans', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [0, 1].map((storey) => ({ view: { kind: 'plan' as const, storey }, scale: 200 })) },
    { name: 'Sections', series: 'sections', layout: { paper: 'A2', orientation: 'landscape' }, slots: [{ view: { kind: 'section' as const, place: 0 }, scale: 200 }] },
  ],
};

describe.skipIf(missing !== null)('ifcsheet set tools over stdio on AC20-FZK-Haus', () => {
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
  /** A tool call that must succeed. */
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = await tool(name, args);
    expect(r.isError, `${name}: ${JSON.stringify(r.content)}`).toBeFalsy();
    return r.structuredContent;
  };
  /** A tool call that must be refused, with `message` in the reason. */
  const refused = async (name: string, args: Record<string, unknown>, message: string | RegExp) => {
    const r = await tool(name, args);
    expect(r.isError, `${name} ${JSON.stringify(args)} should be refused`).toBe(true);
    const reason = `${r.structuredContent?.message ?? r.content?.[0]?.text ?? ''} ${JSON.stringify(r.structuredContent?.details ?? {})}`;
    expect(reason).toMatch(message instanceof RegExp ? message : new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return r.structuredContent;
  };
  const generate = async () => (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-set-')));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-set-test', version: '0' } });
    modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('advertises the new tools, each with a precise description and its required inputs', async () => {
    const tools = (await call('tools/list')).result!.tools!.filter((t) => t.name.startsWith('ifcsheet_'));
    const names = tools.map((t) => t.name);
    for (const n of ['list_sheets', 'add_view', 'place_view', 'set_title_block', 'renumber', 'add_schedule', 'export_dxf', 'issue_set', 'apply_template', 'save_project', 'load_project']) {
      expect(names).toContain(`ifcsheet_${n}`);
    }
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(80);
      expect(t.inputSchema.additionalProperties).toBe(false);
    }
    expect(tools.find((t) => t.name === 'ifcsheet_place_view').description).toMatch(/1:100/);
    expect(tools.find((t) => t.name === 'ifcsheet_add_view').description).toMatch(/metres/);
    expect(tools.find((t) => t.name === 'ifcsheet_issue_set').inputSchema.required).toEqual(['document_id', 'directory']);
  });

  it('builds and edits a set end to end, then issues it: the PDF has a page per sheet, and the DXFs and the register exist', async () => {
    const document_id = await generate();
    const listed = await ok('ifcsheet_list_sheets', { document_id });
    expect(listed.sheets.map((s: any) => s.number)).toEqual(['A-101', 'A-201', 'A-202', 'A-301']);
    expect(listed.sheets[0]).toMatchObject({ name: 'Floor plans', paper: expect.any(String), paperMm: { w: expect.any(Number), h: expect.any(Number) } });
    expect(listed.sheets[0].views.map((v: any) => [v.slot, v.view, v.kind, v.scale])).toEqual([[0, 'Erdgeschoss', 'plan', '1:100'], [1, 'Dachgeschoss', 'plan', '1:100']]);
    // The default set hangs every view but the 3D one.
    expect(listed.unplaced_views.map((v: any) => v.kind)).toEqual(['3d']);

    // A section, added across the building's middle and placed at 1:100: the sections sheet is full, so the engine opens the next.
    const added = await ok('ifcsheet_add_view', { document_id, kind: 'section', axis: 'front', name: 'Long section' });
    expect(added.view).toMatchObject({ name: 'Long section', kind: 'section' });
    expect(added.unplaced_views).toBe(2);
    const placed = await ok('ifcsheet_place_view', { document_id, view: added.view.id, scale: 100 });
    expect(placed).toMatchObject({ new_sheet: true, sheet: { number: 'A-302' } });
    expect(placed.sheet.views).toMatchObject([{ slot: 0, view: 'Long section', kind: 'section', scale: '1:100' }]);

    // A title block field, for the project and for one sheet.
    const project = await ok('ifcsheet_set_title_block', { document_id, fields: { client: 'Muster AG', drawnBy: 'AB' } });
    expect(project.fields).toMatchObject({ client: 'Muster AG', drawnBy: 'AB' });
    const sheetOnly = await ok('ifcsheet_set_title_block', { document_id, sheet: 'A-302', fields: { project: 'Haus Muster, Schnitt' } });
    expect(sheetOnly).toMatchObject({ scope: 'A-302', fields: { client: 'Muster AG', drawnBy: 'AB', project: 'Haus Muster, Schnitt' } });

    // Renumber: a dry run changes nothing, the real call does.
    const dry = await ok('ifcsheet_renumber', { document_id, preset: 'sequential', dry_run: true });
    expect(dry.changes).toEqual([{ from: 'A-101', to: 'A01' }, { from: 'A-201', to: 'A02' }, { from: 'A-202', to: 'A03' }, { from: 'A-301', to: 'A04' }, { from: 'A-302', to: 'A05' }]);
    expect((await ok('ifcsheet_list_sheets', { document_id })).sheets[0].number).toBe('A-101');
    await ok('ifcsheet_renumber', { document_id, preset: 'sequential' });
    expect((await ok('ifcsheet_list_sheets', { document_id })).sheets.map((s: any) => s.number)).toEqual(['A01', 'A02', 'A03', 'A04', 'A05']);

    // A rooms schedule on a sheet of its own.
    const schedule = await ok('ifcsheet_add_schedule', { document_id, kind: 'rooms' });
    expect(schedule.sheet.number).toBe('A06');
    expect(schedule.rows).toBeGreaterThan(5);
    expect(schedule.table[0]).toHaveLength(5);

    const out = join(tmp, 'issue');
    const issued = await ok('ifcsheet_issue_set', { document_id, directory: out, handover: true });
    expect(issued).toMatchObject({ pages: 6, sheets: ['A01', 'A02', 'A03', 'A04', 'A05', 'A06'] });
    const pdf = await readFile(join(out, `${(await readdir(out)).find((f) => f.endsWith('.pdf'))}`));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdfPages(pdf)).toBe(6);
    // ifcsheet_export_pdf draws the schedule sheet as the issue does: the same bytes.
    expect((await ok('ifcsheet_export_pdf', { document_id })).bytes).toBe(issued.files.find((f: any) => f.kind === 'pdf').bytes);
    expect((await readdir(join(out, 'dxf'))).sort()).toEqual(['A01.dxf', 'A02.dxf', 'A03.dxf', 'A04.dxf', 'A05.dxf', 'A06.dxf']);
    const register = (await readFile(join(out, 'register.csv'), 'utf8')).trim().split('\r\n');
    expect(register[0]).toBe('Number,Name,Paper,Scale,Views');
    expect(register).toHaveLength(7);
    expect(register[5]).toContain('A05,Sections,');
    expect(register[5]).toContain('1:100');
    expect(register[5]).toContain('Long section');
    expect(await readdir(join(out, 'schedules'))).toEqual(['A06.csv']);
    expect(await readFile(join(out, 'schedules', 'A06.csv'), 'utf8')).toContain(schedule.table[1][1]);
    // The package: PDF, DXFs, register, schedule and the IFC as opened.
    const zip = unzip(await readFile(join(out, 'handover.zip')));
    expect(Object.keys(zip).filter((n) => n.endsWith('.dxf'))).toHaveLength(6);
    expect(Object.keys(zip).some((n) => n.endsWith('.ifc'))).toBe(true);
    expect(zip[Object.keys(zip).find((n) => n.endsWith('.ifc'))!].equals(await readFile(FZK))).toBe(true);
    expect(issued.handover.files).toEqual(Object.keys(zip));
  }, 300_000);

  it('places a view on a named sheet at a slot, moves a placed view, and refuses what does not fit without changing the set', async () => {
    const document_id = await generate();
    const plan = await ok('ifcsheet_add_view', { document_id, kind: 'plan', level: 'Erdgeschoss', name: 'Ground, cut low', cut_height_m: 0.5 });
    const first = await ok('ifcsheet_place_view', { document_id, view: plan.view.name, sheet: 'A-201', slot: 0, scale: 200 });
    expect(first.sheet.views.map((v: any) => [v.slot, v.view, v.scale])).toEqual([[0, 'Ground, cut low', '1:200'], [1, 'South Elevation', '1:200'], [2, 'North Elevation', '1:200']]);
    // Moving it: it leaves A-201, and what stays is laid out again.
    const moved = await ok('ifcsheet_place_view', { document_id, view: plan.view.id, sheet: 'A-101' });
    expect(moved.sheet.views.map((v: any) => v.view)).toContain('Ground, cut low');
    const sheets = (await ok('ifcsheet_list_sheets', { document_id })).sheets;
    expect(sheets.find((s: any) => s.number === 'A-201').views.map((v: any) => v.view)).toEqual(['South Elevation', 'North Elevation']);
    // 1:20 cannot fit a plan of the house on A-101: refused, and the set is as it was.
    const before = JSON.stringify((await ok('ifcsheet_list_sheets', { document_id })).sheets);
    await refused('ifcsheet_place_view', { document_id, view: 'East Elevation', sheet: 'A-101', scale: 20 }, /do not fit sheet A-101 at 1:20/);
    expect(JSON.stringify((await ok('ifcsheet_list_sheets', { document_id })).sheets)).toBe(before);
  }, 300_000);

  it('adds every kind of view: a plan, an elevation, sections by plane and by line, an axonometric cut away at a storey', async () => {
    const document_id = await generate();
    const kinds: [Record<string, unknown>, string][] = [
      [{ kind: 'elevation', direction: 'east', name: 'East again' }, 'elevation'],
      [{ kind: 'section', from: [0, 0], to: [10, 0], look_towards: [5, 5] }, 'section'],
      [{ kind: 'section', axis: 'side', offset_m: 4, flipped: true, depth_m: 12 }, 'section'],
      [{ kind: 'axonometric', preset: 'nw' }, '3d'],
      [{ kind: 'axonometric', cut_level: 'Erdgeschoss', cut_height_m: 1.5 }, '3d'],
    ];
    for (const [args, kind] of kinds) {
      const added = await ok('ifcsheet_add_view', { document_id, ...args });
      expect(added.view.kind).toBe(kind);
    }
    const doc = (await ok('ifcsheet_generate_set', { model_id: modelId })).document;
    expect(doc.views.length).toBeGreaterThan(5);
    // The cut-away is on a sheet and drawn: the PDF is made (a 3D view has no series, so it names its sheet).
    const unplaced = (await ok('ifcsheet_list_sheets', { document_id })).unplaced_views;
    expect(unplaced.map((v: any) => v.name)).toEqual(expect.arrayContaining(['Axonometric', 'Cut-away axonometric']));
    const axo = unplaced.find((v: any) => v.name === 'Cut-away axonometric');
    await refused('ifcsheet_place_view', { document_id, view: axo.id }, /belongs to no sheet series.*give sheet/);
    await ok('ifcsheet_place_view', { document_id, view: axo.id, sheet: 'A-301', scale: 200 });
    const pdf = await ok('ifcsheet_export_pdf', { document_id });
    expect(pdf.pages).toBe(4);
  }, 300_000);

  it('applies a template, as `ifcsheet build --template` does', async () => {
    const template = serializeSetTemplate(OFFICE);
    const applied = await ok('ifcsheet_apply_template', { model_id: modelId, template_json: template });
    const viaPath = join(tmp, 'office.bvset');
    await writeFile(viaPath, template);
    const again = await ok('ifcsheet_apply_template', { model_id: modelId, template_path: viaPath });
    expect(again.sheets.map((s: any) => s.number)).toEqual(applied.sheets.map((s: any) => s.number));
    // The two plans on one sheet, the template's section on the next, the second proposed section laid out after it.
    expect(applied.sheets.map((s: any) => s.number)).toEqual(['A-101', 'A-301', 'A-302']);

    const cliOut = join(tmp, 'cli-template');
    await cli('build', FZK, '--template', viaPath, '--out', join(cliOut, 'set.pdf'), '--dxf', join(cliOut, 'dxf'));
    const dxfOut = join(tmp, 'tool-template');
    await ok('ifcsheet_export_dxf', { document_id: applied.document_id, directory: dxfOut });
    expect((await readdir(dxfOut)).sort()).toEqual((await readdir(join(cliOut, 'dxf'))).sort());
    for (const f of await readdir(dxfOut)) expect(await readFile(join(dxfOut, f), 'utf8')).toBe(await readFile(join(cliOut, 'dxf', f), 'utf8'));
    const pdfPath = join(tmp, 'tool-template.pdf');
    expect((await ok('ifcsheet_export_pdf', { document_id: applied.document_id, file_path: pdfPath })).pages).toBe(pdfPages(await readFile(join(cliOut, 'set.pdf'))));
    // The notes say what the rules met, in the CLI's words.
    expect(applied.notes.join('\n')).toContain('left off the sheets');
    await refused('ifcsheet_apply_template', { model_id: modelId, template_json: '{nope' }, /cannot be used as a set template/);
    await refused('ifcsheet_apply_template', { model_id: modelId }, /exactly one of template_path/);
    await refused('ifcsheet_apply_template', { model_id: modelId, template_path: viaPath, template_json: template }, /exactly one of template_path/);
  }, 300_000);

  it('writes the same DXF files and the same room schedule as the command line', async () => {
    const document_id = await generate();
    const cliOut = join(tmp, 'cli-default');
    await cli('build', FZK, '--out', join(cliOut, 'set.pdf'), '--dxf', join(cliOut, 'dxf'));
    const dxfOut = join(tmp, 'tool-default');
    const written = await ok('ifcsheet_export_dxf', { document_id, directory: dxfOut });
    expect(written.files.map((f: any) => f.sheet)).toEqual(['A-101', 'A-201', 'A-202', 'A-301']);
    expect((await readdir(dxfOut)).sort()).toEqual((await readdir(join(cliOut, 'dxf'))).sort());
    for (const f of await readdir(dxfOut)) expect(await readFile(join(dxfOut, f), 'utf8')).toBe(await readFile(join(cliOut, 'dxf', f), 'utf8'));
    // One sheet only.
    const one = await ok('ifcsheet_export_dxf', { document_id, directory: join(tmp, 'tool-one'), sheet: 'a-301' });
    expect(one.files).toHaveLength(1);

    await ok('ifcsheet_add_schedule', { document_id, kind: 'rooms' });
    const issued = await ok('ifcsheet_issue_set', { document_id, directory: join(tmp, 'tool-rooms') });
    const csv = await readFile(join(tmp, 'tool-rooms', 'schedules', 'A-601.csv'), 'utf8');
    expect(csv).toBe(quiet((await cli('rooms', FZK, '--csv')).stdout));
    expect(issued.files.map((f: any) => f.kind)).toEqual(['pdf', 'dxf', 'dxf', 'dxf', 'dxf', 'dxf', 'register', 'schedule']);
  }, 300_000);

  it('adds a bill of quantities from a saved project, as `ifcsheet boq` sums it', async () => {
    const document_id = await generate();
    const project = JSON.stringify({
      format: 'ifclite-project', version: 1, name: 'Haus',
      boqArticles: [{ id: 'b1', code: 'EX-01', description: 'Walls 240', unit: 'm3', quantity: 'NetVolume', factor: 1, typeName: 'Leichtbeton 102890359 240' }],
    });
    const file = join(tmp, 'boq.ifclite-project.json');
    await writeFile(file, project);
    const added = await ok('ifcsheet_add_schedule', { document_id, kind: 'boq', project_path: file });
    expect(added.rows).toBe(1);
    expect(added.table[1].slice(1, 3)).toEqual(['EX-01', 'Walls 240']);
    const out = (await cli('boq', FZK, '--project', file, '--csv')).stdout;
    const issued = await ok('ifcsheet_issue_set', { document_id, directory: join(tmp, 'tool-boq') });
    expect(issued.files.some((f: any) => f.kind === 'schedule')).toBe(true);
    expect(await readFile(join(tmp, 'tool-boq', 'schedules', 'A-601.csv'), 'utf8')).toBe(out);
  }, 300_000);

  it('saves the project and loads it back: the same sheets, the schedule sheet, and what the app kept', async () => {
    const document_id = await generate();
    await ok('ifcsheet_set_title_block', { document_id, fields: { client: 'Muster AG' } });
    await ok('ifcsheet_add_schedule', { document_id, kind: 'rooms', locale: 'ro' });
    const file = join(tmp, 'haus.ifclite-project.json');
    const saved = await ok('ifcsheet_save_project', { document_id, file_path: file });
    expect(saved.sheets).toEqual(['A-101', 'A-201', 'A-202', 'A-301', 'A-601']);
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk).toMatchObject({ format: 'ifclite-project', version: 1, titleBlock: { client: 'Muster AG' } });
    // The engine's own reader (`ifcsheet check --project`) accepts the file.
    expect((await ok('ifcsheet_check_readiness', { model_id: modelId, project_path: file })).project).toBe(file);

    // The app's other state travels through a load and a save.
    onDisk.drafts = [{ id: 'd1', keep: 'me' }];
    const loaded = await ok('ifcsheet_load_project', { model_id: modelId, project_json: JSON.stringify(onDisk) });
    expect(loaded.sheets.map((s: any) => s.number)).toEqual(['A-101', 'A-201', 'A-202', 'A-301', 'A-601']);
    expect(loaded.sheets[4].schedule).toBe('rooms');
    expect(loaded.sheets[0].views.map((v: any) => v.view)).toEqual(['Erdgeschoss', 'Dachgeschoss']);
    const resaved = join(tmp, 'resaved.ifclite-project.json');
    await ok('ifcsheet_save_project', { document_id: loaded.document_id, file_path: resaved });
    expect(JSON.parse(await readFile(resaved, 'utf8')).drafts).toEqual([{ id: 'd1', keep: 'me' }]);
    // The loaded set draws: five pages, the schedule's too.
    expect((await ok('ifcsheet_export_pdf', { document_id: loaded.document_id })).pages).toBe(5);
    expect((await ok('ifcsheet_load_project', { model_id: modelId, project_path: file })).sheets).toHaveLength(5);
  }, 300_000);

  it('refuses bad input to every tool, naming what is wrong', async () => {
    const document_id = await generate();
    const view = (await ok('ifcsheet_add_view', { document_id, kind: 'elevation', direction: 'north' })).view;
    // Handles
    await refused('ifcsheet_list_sheets', { document_id: 'sheetset-999' }, /No drawing set 'sheetset-999'/);
    await refused('ifcsheet_list_sheets', { document_id: '' }, /document_id is required/);
    // add_view
    await refused('ifcsheet_add_view', { document_id, kind: 'plan' }, /level is required/);
    await refused('ifcsheet_add_view', { document_id, kind: 'plan', level: 'Keller' }, /No storey 'Keller'/);
    await refused('ifcsheet_add_view', { document_id, kind: 'plan', level: 'Erdgeschoss', cut_height_m: -1 }, /cut_height_m must be a number from 0.1 to 50/);
    await refused('ifcsheet_add_view', { document_id, kind: 'elevation' }, /direction is required/);
    await refused('ifcsheet_add_view', { document_id, kind: 'elevation', direction: 'up' }, /direction.*Expected one of/);
    await refused('ifcsheet_add_view', { document_id, kind: 'section' }, /needs axis/);
    await refused('ifcsheet_add_view', { document_id, kind: 'section', from: [0, 0] }, /needs both from and to/);
    await refused('ifcsheet_add_view', { document_id, kind: 'section', from: [1, 1], to: [1, 1] }, /same point/);
    await refused('ifcsheet_add_view', { document_id, kind: 'section', from: [0, 0, 0], to: [1, 1] }, /\$\.from/);
    await refused('ifcsheet_add_view', { document_id, kind: 'axonometric', box_min: [0, 0, 0] }, /needs both box_min and box_max/);
    await refused('ifcsheet_add_view', { document_id, kind: 'axonometric', box_min: [0, 0, 0], box_max: [-1, 1, 1] }, /box_min must be below box_max/);
    await refused('ifcsheet_add_view', { document_id, kind: 'axonometric', cut_height_m: 1 }, /needs cut_level/);
    await refused('ifcsheet_add_view', { document_id, kind: 'roof' }, /\$\.kind/);
    // place_view
    await refused('ifcsheet_place_view', { document_id, view: 'No such view' }, /No view 'No such view'/);
    await refused('ifcsheet_place_view', { document_id, view: view.id, sheet: 'Z-999' }, /No sheet 'Z-999'/);
    await refused('ifcsheet_place_view', { document_id, view: view.id, scale: 77 }, /scale must be one of 1, 2, 5/);
    await refused('ifcsheet_place_view', { document_id, view: view.id, slot: 1 }, /slot needs sheet/);
    await refused('ifcsheet_place_view', { document_id, view: view.id, sheet: 'A-301', slot: 9 }, /slot 9 is past the end/);
    await ok('ifcsheet_add_schedule', { document_id, kind: 'rooms' });
    await refused('ifcsheet_place_view', { document_id, view: view.id, sheet: 'A-601' }, /prints a schedule/);
    // set_title_block
    await refused('ifcsheet_set_title_block', { document_id, fields: {} }, /at least one of/);
    await refused('ifcsheet_set_title_block', { document_id, fields: { colour: 'red' } }, /Unknown title block field 'colour'/);
    await refused('ifcsheet_set_title_block', { document_id, fields: { client: 5 } }, /must be text/);
    await refused('ifcsheet_set_title_block', { document_id, fields: { client: 'x'.repeat(201) } }, /at most 200/);
    await refused('ifcsheet_set_title_block', { document_id, fields: { date: '25 Oct' } }, /ISO date/);
    await refused('ifcsheet_set_title_block', { document_id, fields: { client: 'x' }, sheet: 'Q' }, /No sheet 'Q'/);
    // renumber
    await refused('ifcsheet_renumber', { document_id, preset: 'roman' }, /\$\.preset/);
    await refused('ifcsheet_renumber', { document_id, discipline: 'TOOLONGDISCIPLINE' }, /\$\.discipline/);
    await refused('ifcsheet_renumber', { document_id, overrides: 'maybe' }, /\$\.overrides/);
    // add_schedule
    await refused('ifcsheet_add_schedule', { document_id, kind: 'doors' }, /\$\.kind/);
    await refused('ifcsheet_add_schedule', { document_id, kind: 'boq' }, /exactly one of project_path/);
    await refused('ifcsheet_add_schedule', { document_id, kind: 'boq', project_json: JSON.stringify({ format: 'ifclite-project', version: 1 }) }, /holds no bill-of-quantities articles/);
    await refused('ifcsheet_add_schedule', { document_id, kind: 'boq', project_json: 'nope' }, /cannot be used as a project/);
    await refused('ifcsheet_add_schedule', { document_id, kind: 'rooms', project_json: '{}' }, /for kind "boq"/);
    await refused('ifcsheet_add_schedule', { document_id, kind: 'rooms', paper: 'A9' }, /\$\.paper/);
    // files
    await refused('ifcsheet_export_dxf', { document_id, directory: '/etc/ifcsheet-test' }, /outside|allowed|not permitted/i);
    await refused('ifcsheet_export_dxf', { document_id, directory: join(tmp, 'x'), sheet: 'Q' }, /No sheet 'Q'/);
    await refused('ifcsheet_issue_set', { document_id, directory: '/etc/ifcsheet-test' }, /outside|allowed|not permitted/i);
    await refused('ifcsheet_issue_set', { document_id, directory: join(tmp, 'x'), pattern: '{number}' }, /pattern is for handover/);
    await refused('ifcsheet_issue_set', { document_id, directory: join(tmp, 'never.ifc') }, /never write IFC files/);
    await refused('ifcsheet_save_project', { document_id, file_path: join(tmp, 'p.txt') }, /must end in .json/);
    await refused('ifcsheet_save_project', { document_id, file_path: FZK }, /never write IFC files/);
    // load_project
    const load = (project: unknown) => ({ model_id: modelId, project_json: typeof project === 'string' ? project : JSON.stringify(project) });
    await refused('ifcsheet_load_project', { model_id: modelId }, /exactly one of project_path/);
    await refused('ifcsheet_load_project', load('{nope'), /is not JSON/);
    await refused('ifcsheet_load_project', load({ format: 'other' }), /"format" must be "ifclite-project"/);
    await refused('ifcsheet_load_project', load({ format: 'ifclite-project', version: 99, views: [], sheets: [] }), /version 99/);
    await refused('ifcsheet_load_project', load({ format: 'ifclite-project', version: 1, views: [] }), /must be arrays/);
    await refused('ifcsheet_load_project', load({ format: 'ifclite-project', version: 1, views: [{ id: 'v', name: 'V', kind: 'moon' }], sheets: [] }), /views\[0\]/);
    await refused('ifcsheet_load_project', load({ format: 'ifclite-project', version: 1, views: [], sheets: [{ id: 's', number: 'A-1', name: 'S', viewports: [{ viewId: 'ghost', x: 1, y: 1, scale: 100 }] }] }), /shows a view the project does not have/);
    await refused('ifcsheet_load_project', { model_id: 'sheetmodel-999', project_json: '{}' }, /No drawing-set model/);
    // apply_template with a missing handle
    await refused('ifcsheet_apply_template', { model_id: 'sheetmodel-999', template_json: '{}' }, /No drawing-set model/);
  }, 300_000);

  it('never writes over the model it opened, whichever tool is given its path', async () => {
    const copy = join(tmp, 'model.dat');
    await copyFile(FZK, copy);
    const opened = await ok('ifcsheet_open_model', { file_path: copy });
    const document_id = (await ok('ifcsheet_generate_set', { model_id: opened.model_id })).document_id;
    await refused('ifcsheet_export_pdf', { document_id, file_path: copy }, /never write IFC files or the model they opened/);
    expect((await readFile(copy)).equals(await readFile(FZK))).toBe(true);
  }, 300_000);
});
