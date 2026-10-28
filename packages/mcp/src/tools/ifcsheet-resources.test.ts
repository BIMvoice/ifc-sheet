/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The third slice of the drawing-set tools (#165), over the stdio transport on AC20-FZK-Haus: the resources (the project schema, the
 * session's project and sheets), the prompts, `dry_run` on the editing tools, and `annotated_ifc` in `ifcsheet_issue_set`.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IfcParser } from '@ifc-lite/parser';
import { serializeSetTemplate } from '@bimvoice/ifcsheet';
import { PROTOCOL_VERSION } from '../protocol/index.js';
import { createMCPServer } from '../index.js';
import { StdioTransport } from '../transport/stdio.js';

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const ENGINE = fileURLToPath(new URL('../../../ifcsheet/dist/', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(ENGINE) ? 'the engine is not built: run `pnpm --filter @bimvoice/ifcsheet build`' : null;
if (missing) console.warn(`[mcp] skipping the ifcsheet resource tests: ${missing}`);

type Reply = { result?: any; error?: { message?: string } };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

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

/** The STEP entity lines of an IFC by express id. */
const stepLines = (text: string): Map<number, string> => {
  const out = new Map<number, string>();
  for (const m of text.matchAll(/^#(\d+)\s*=[^\n]*;$/gm)) out.set(Number(m[1]), m[0]);
  return out;
};

describe.skipIf(missing !== null)('ifcsheet resources, prompts, dry runs and the annotated IFC over stdio on AC20-FZK-Haus', () => {
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
    expect(`${r.structuredContent?.message ?? r.content?.[0]?.text ?? ''}`).toMatch(message);
  };
  const resource = async (uri: string) => JSON.parse((await call('resources/read', { uri })).result.contents[0].text);
  const generate = async () => (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;
  /** What the session holds of a set, through the resource every client can read. */
  const sessionProject = () => resource('ifcsheet://session/project');

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-res-')));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-resources-test', version: '0' } });
    modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  describe('resources', () => {
    it('lists the schema alone while the session holds no set, and reading the session\'s project then says what to do', async () => {
      const listed = (await call('resources/list')).result.resources.map((r: { uri: string }) => r.uri);
      expect(listed).toContain('ifcsheet://project/schema');
      expect(listed).not.toContain('ifcsheet://session/project');
      const read = await call('resources/read', { uri: 'ifcsheet://session/project' });
      expect(read.error?.message ?? '').toMatch(/no drawing set/i);
    });

    it('lists and reads the three once there is a set; the project is what ifcsheet_save_project writes and the sheets what ifcsheet_list_sheets says', async () => {
      const id = await generate();
      await ok('ifcsheet_add_schedule', { document_id: id, kind: 'rooms', locale: 'ro' });
      const listed = (await call('resources/list')).result.resources.map((r: { uri: string; mimeType: string }) => [r.uri, r.mimeType]);
      expect(listed).toEqual(expect.arrayContaining([['ifcsheet://project/schema', 'application/schema+json'], ['ifcsheet://session/project', 'application/json'], ['ifcsheet://session/sheets', 'application/json']]));

      const file = join(tmp, 'saved.ifclite-project.json');
      await ok('ifcsheet_save_project', { document_id: id, file_path: file });
      const saved = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      const { savedAt, ...savedBody } = saved;
      expect(typeof savedAt).toBe('string');
      expect(await sessionProject()).toEqual(savedBody);

      const listing = (await tool('ifcsheet_list_sheets', { document_id: id })).structuredContent;
      expect(await resource('ifcsheet://session/sheets')).toEqual(listing);
      // The schedule sheet is in both: the resource shows the session, not only the generated set.
      expect(listing.sheets.some((s: { schedule?: string }) => s.schedule === 'rooms')).toBe(true);
    });

    it('serves a schema that a saved project validates against, and refuses each corruption of it', async () => {
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      const validate = ajv.compile(await resource('ifcsheet://project/schema'));
      const project = await sessionProject();
      expect(validate(project), JSON.stringify(validate.errors)).toBe(true);
      // What the app adds to a file is allowed and kept.
      expect(validate({ ...clone(project), drafts: [{ id: 'd1' }], units: 'mm' }), JSON.stringify(validate.errors)).toBe(true);

      const corrupt: [string, (p: any) => void][] = [
        ['a wrong format', (p) => { p.format = 'something-else'; }],
        ['a newer version than this build reads', (p) => { p.version = 99; }],
        ['no sheets', (p) => { delete p.sheets; }],
        ['sheets that are not a list', (p) => { p.sheets = {}; }],
        ['a sheet with no number', (p) => { delete p.sheets[0].number; }],
        ['a viewport with scale 0', (p) => { p.sheets.find((s: any) => s.viewports?.length).viewports[0].scale = 0; }],
        ['a viewport with no position', (p) => { delete p.sheets.find((s: any) => s.viewports?.length).viewports[0].x; }],
        ['a view of an unknown kind', (p) => { p.views[0].kind = 'hologram'; }],
        ['a plan with no level', (p) => { delete p.views.find((v: any) => v.kind === 'plan').level; }],
        ['an elevation facing nowhere', (p) => { p.views.find((v: any) => v.kind === 'elevation').direction = 'up'; }],
        ['a paper that does not exist', (p) => { p.sheets[0].paper = 'A9'; }],
        ['a title block value that is not text', (p) => { p.titleBlock = { client: 5 }; }],
        ['a schedule of an unknown kind', (p) => { p.ifcsheetSchedules[0].kind = 'cakes'; }],
      ];
      for (const [what, apply] of corrupt) {
        const broken = clone(project);
        apply(broken);
        expect(validate(broken), `${what} should not validate`).toBe(false);
      }
    });

    it('is what ifcsheet_load_project reads: the resource\'s project loads back as the same set', async () => {
      const text = JSON.stringify(await sessionProject());
      const loaded = await ok('ifcsheet_load_project', { model_id: modelId, project_json: text });
      expect(await resource('ifcsheet://session/project')).toEqual(JSON.parse(text));
      expect(loaded.sheets.length).toBe(JSON.parse(text).sheets.length);
    });
  });

  describe('prompts', () => {
    it('lists the three and renders each with its arguments, naming only tools that exist', async () => {
      const listed = (await call('prompts/list')).result.prompts as { name: string; arguments?: { name: string; required?: boolean }[] }[];
      const names = ['prepare_permit_set', 'update_set_for_new_model', 'check_readiness_and_fix'];
      for (const n of names) expect(listed.map((p) => p.name)).toContain(n);

      const tools = new Set((await call('tools/list')).result.tools.map((t: { name: string }) => t.name));
      const render = async (name: string, args: Record<string, string>) => (await call('prompts/get', { name, arguments: args })).result.messages.map((m: any) => m.content.text).join('\n') as string;

      const permit = await render('prepare_permit_set', { model_path: FZK, output_dir: tmp, phase: 'DTAC', project_number: '42/2026', address: 'Str. Exemplu 1', drawn_by: 'AB', au_reference: '198' });
      const order = ['ifcsheet_open_model', 'ifcsheet_check_readiness', 'ifcsheet_generate_set', 'ifcsheet_set_title_block', 'ifcsheet_add_schedule', 'ifcsheet_list_sheets', 'ifcsheet_save_project', 'ifcsheet_issue_set'];
      // The numbered steps, each led by its tool, in the order the prompt gives them.
      const steps = [...permit.matchAll(/^\d+\. (ifcsheet_[a-z_]+)/gm)].map((m) => m[1]);
      expect(steps).toEqual(['ifcsheet_open_model', 'ifcsheet_check_readiness', 'ifcsheet_generate_set', 'ifcsheet_set_title_block', 'ifcsheet_add_schedule', 'ifcsheet_list_sheets', 'ifcsheet_check_readiness', 'ifcsheet_save_project', 'ifcsheet_issue_set']);
      for (const t of order) expect(permit).toContain(t);
      expect(permit).toContain(JSON.stringify(FZK));
      expect(permit).toContain('phase: "DTAC"');
      expect(permit).toContain('projectNumber: "42/2026"');
      expect(permit).toContain('198 m2');
      expect(permit).toContain('handover: true');
      // A field the user did not give is asked for, not made up.
      expect(permit).not.toContain('checkedBy:');
      expect(permit).toMatch(/ask the user for the others/);

      const withTemplate = await render('prepare_permit_set', { model_path: FZK, output_dir: tmp, template_path: '/x/office.bvset' });
      expect(withTemplate).toContain('ifcsheet_apply_template');
      expect(withTemplate).not.toContain('ifcsheet_generate_set with');
      expect(await render('prepare_permit_set', {})).toContain('<model_path: ask the user>');

      const update = await render('update_set_for_new_model', { model_path: FZK, project_path: '/x/p.json', output_dir: tmp, handover: 'true' });
      for (const t of ['ifcsheet_open_model', 'ifcsheet_load_project', 'ifcsheet_list_sheets', 'ifcsheet_add_view', 'ifcsheet_place_view', 'ifcsheet_check_readiness', 'ifcsheet_save_project', 'ifcsheet_issue_set']) expect(update).toContain(t);
      expect(update).toContain('handover: true');
      expect(await render('update_set_for_new_model', { model_path: FZK, project_path: '/x/p.json', output_dir: tmp })).not.toContain('handover: true');

      const fix = await render('check_readiness_and_fix', { model_id: 'sheetmodel-7', project_path: '/x/p.json' });
      expect(fix).toContain('sheetmodel-7');
      expect(fix).not.toContain('ifcsheet_open_model with');
      expect(fix).toContain('project_path: "/x/p.json"');
      expect(await render('check_readiness_and_fix', { model_path: FZK })).toContain('ifcsheet_open_model with');

      for (const text of [permit, withTemplate, update, fix]) {
        for (const named of text.match(/\bifcsheet_[a-z_]+/g) ?? []) expect(tools.has(named), `${named} is not a tool`).toBe(true);
      }
    });
  });

  describe('dry_run', () => {
    /** The same call without dry_run reports the same change, ignoring the ids the engine makes fresh each time. */
    const ids = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (key, value) => (['id', 'viewId', 'document_id', 'dry_run'].includes(key) ? undefined : value)));

    it('add_view, place_view, set_title_block and add_schedule change nothing in the session and report what the real call then does', async () => {
      const id = await generate();
      const before = await sessionProject();
      const listBefore = (await tool('ifcsheet_list_sheets', { document_id: id })).structuredContent;

      const dryView = await ok('ifcsheet_add_view', { document_id: id, kind: 'section', axis: 'front', dry_run: true });
      expect(dryView.dry_run).toBe(true);
      expect(await sessionProject()).toEqual(before);
      const realView = await ok('ifcsheet_add_view', { document_id: id, kind: 'section', axis: 'front' });
      expect(realView.dry_run).toBe(false);
      expect(ids(dryView)).toEqual(ids(realView));
      expect((await sessionProject()).views.length).toBe(before.views.length + 1);

      const afterView = await sessionProject();
      const dryPlace = await ok('ifcsheet_place_view', { document_id: id, view: realView.view.name, scale: 100, dry_run: true });
      expect(await sessionProject()).toEqual(afterView);
      const realPlace = await ok('ifcsheet_place_view', { document_id: id, view: realView.view.name, scale: 100 });
      expect(ids(dryPlace)).toEqual(ids(realPlace));
      expect(JSON.stringify(await sessionProject())).not.toEqual(JSON.stringify(afterView));

      const afterPlace = await sessionProject();
      const fields = { phase: 'DTAC', projectNumber: '42/2026', drawnBy: 'AB' };
      const dryTitle = await ok('ifcsheet_set_title_block', { document_id: id, fields, dry_run: true });
      expect(await sessionProject()).toEqual(afterPlace);
      expect(dryTitle.changed).toEqual({ phase: { from: '', to: 'DTAC' }, projectNumber: { from: '', to: '42/2026' }, drawnBy: { from: '', to: 'AB' } });
      const realTitle = await ok('ifcsheet_set_title_block', { document_id: id, fields });
      expect(ids(dryTitle)).toEqual(ids(realTitle));
      expect((await sessionProject()).titleBlock).toMatchObject(fields);
      // Said again, nothing differs: an empty change.
      expect((await ok('ifcsheet_set_title_block', { document_id: id, fields, dry_run: true })).changed).toEqual({});

      const afterTitle = await sessionProject();
      const dryRooms = await ok('ifcsheet_add_schedule', { document_id: id, kind: 'rooms', locale: 'ro', dry_run: true });
      expect(await sessionProject()).toEqual(afterTitle);
      expect((await tool('ifcsheet_list_sheets', { document_id: id })).structuredContent.sheets.some((s: { schedule?: string }) => s.schedule)).toBe(false);
      const realRooms = await ok('ifcsheet_add_schedule', { document_id: id, kind: 'rooms', locale: 'ro' });
      expect(ids(dryRooms)).toEqual(ids(realRooms));
      expect(realRooms.rows).toBeGreaterThan(0);
      // The building total (Au) is the last row of the table, and the dry run has it too.
      expect(realRooms.total_row[1]).toBe('Total clădire (Au)');
      expect(dryRooms.total_row).toEqual(realRooms.total_row);
      expect((await sessionProject()).ifcsheetSchedules).toHaveLength(1);
      expect(listBefore.sheets.length).toBeLessThan((await sessionProject()).sheets.length);
    });

    it('a dry run that cannot be done is refused as the real call is, and changes nothing', async () => {
      const id = await generate();
      const before = await sessionProject();
      await refused('ifcsheet_place_view', { document_id: id, view: 'No such view', dry_run: true }, /No view/);
      await refused('ifcsheet_set_title_block', { document_id: id, fields: { nonsense: 'x' }, dry_run: true }, /Unknown title block field/);
      expect(await sessionProject()).toEqual(before);
    });

    it('apply_template lays the set out and reports it without making a document', async () => {
      const id = await generate();
      const template = serializeSetTemplate({ name: 'Office', annotations: {}, schedules: [], sheets: [{ name: 'Office plans', series: 'plans', layout: { paper: 'A1', orientation: 'landscape' }, slots: [0, 1].map((storey) => ({ view: { kind: 'plan' as const, storey }, scale: 200 })) }] });
      const before = await sessionProject();
      const dry = await ok('ifcsheet_apply_template', { model_id: modelId, template_json: template, dry_run: true });
      expect(dry.dry_run).toBe(true);
      expect(dry.document_id).toBeNull();
      expect(await sessionProject()).toEqual(before);
      await refused('ifcsheet_list_sheets', { document_id: 'sheetset-999' }, /No drawing set/);
      const real = await ok('ifcsheet_apply_template', { model_id: modelId, template_json: template });
      expect(real.document_id).toMatch(/^sheetset-/);
      expect(real.document_id).not.toBe(id);
      expect(ids(dry)).toEqual(ids(real));
      // The real call made the session's current set; the dry one had not.
      expect((await resource('ifcsheet://session/sheets')).document_id).toBe(real.document_id);
    });
  });

  describe('annotated_ifc', () => {
    it('writes a copy of the IFC the parser reads, holds every original line, says it has no annotations, and goes in handover.zip', async () => {
      const id = await generate();
      const out = join(tmp, 'issue-annotated');
      const sourceHash = createHash('sha256').update(readFileSync(FZK)).digest('hex');
      const r = await ok('ifcsheet_issue_set', { document_id: id, directory: out, handover: true, annotated_ifc: true });
      const entry = r.files.find((f: { kind: string }) => f.kind === 'annotated_ifc');
      expect(entry.file).toBe(join(out, 'AC20-FZK-Haus.annotated.ifc'));
      expect(r.annotated_ifc).toMatchObject({ file: entry.file, annotations: 0, marks: 0, drafts_not_written: 0, schema: 'IFC4' });
      expect(r.annotated_ifc.note).toMatch(/hold no drafts/);

      const copy = await readFile(entry.file);
      expect(copy.byteLength).toBe(entry.bytes);
      // The checks of the engine's own annotated-IFC tests (#326): the parser reads it, every STEP line of the source is held byte for byte, the source is untouched.
      const store = await new IfcParser().parseColumnar(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer, { disableWorkerScan: true });
      expect(store.schemaVersion).toBe('IFC4');
      const original = stepLines(readFileSync(FZK, 'utf8'));
      const written = stepLines(copy.toString('utf8'));
      expect(original.size).toBeGreaterThan(1000);
      for (const [n, line] of original) expect(written.get(n), `#${n}`).toBe(line);
      expect(createHash('sha256').update(readFileSync(FZK)).digest('hex')).toBe(sourceHash);

      const zip = unzip(await readFile(join(out, 'handover.zip')));
      const ifcs = Object.keys(zip).filter((n) => n.endsWith('.ifc'));
      expect(ifcs).toHaveLength(2);
      expect(ifcs.some((n) => /annotated/i.test(n))).toBe(true);
      expect(Buffer.compare(zip[ifcs.find((n) => !/annotated/i.test(n))!], readFileSync(FZK))).toBe(0);
      expect(Buffer.compare(zip[ifcs.find((n) => /annotated/i.test(n))!], copy)).toBe(0);
      expect(r.handover.files).toEqual(expect.arrayContaining(ifcs));
    });

    it('is off by default, and never overwrites the model that was opened', async () => {
      const id = await generate();
      const plain = join(tmp, 'issue-plain');
      const r = await ok('ifcsheet_issue_set', { document_id: id, directory: plain, handover: true });
      expect((await readdir(plain)).some((n) => n.endsWith('.ifc'))).toBe(false);
      expect(r.annotated_ifc).toBeUndefined();

      // A model opened from the very path the copy would take: refused, and the model is as it was.
      const dir = join(tmp, 'clash');
      const source = join(dir, 'AC20-FZK-Haus.annotated.ifc');
      await mkdir(dir, { recursive: true });
      await writeFile(source, readFileSync(FZK));
      await ok('ifcsheet_open_model', { file_path: source });
      await refused('ifcsheet_issue_set', { document_id: id, directory: dir, annotated_ifc: true }, /never write IFC files or the model they opened/);
      expect(Buffer.compare(await readFile(source), readFileSync(FZK))).toBe(0);
    });

    it('refuses a value that is not true or false before anything is written', async () => {
      const id = await generate();
      const out = join(tmp, 'issue-nothing');
      await refused('ifcsheet_issue_set', { document_id: id, directory: out, annotated_ifc: 'yes' }, /Input validation failed/);
      expect(existsSync(out)).toBe(false);
    });
  });
});
