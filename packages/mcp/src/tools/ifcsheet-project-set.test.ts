/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #479: a project the app saved with a hand-arranged set prints the same sheets through `ifcsheet_load_project` and
 * `ifcsheet_export_pdf` as through `ifcsheet build --project`, over the stdio transport on AC20-FZK-Haus. The project is the one
 * this server saves, edited as the app edits it: a plan's viewport moved, a dimension and a text drawn on the plan, a list schedule
 * placed on a sheet of its own (a viewport whose `viewId` names the schedule, which the loader accepts). Every page prints the same
 * texts in both PDFs, the dimension's figure and the schedule's rows among them. The app's side (the PDF against the app's sheet
 * SVG) is `apps/viewer/src/project/cli-project-set.fzk.test.tsx`.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
if (missing) console.warn(`[mcp] skipping the project set tests: ${missing}`);

type Reply = { result?: { isError?: boolean; structuredContent?: any; content?: { text: string }[] }; error?: unknown };
const cli = (...args: string[]) => promisify(execFile)(process.execPath, [CLI, ...args], { maxBuffer: 64 * 1024 * 1024 });

const WALLS_BY_TYPE = {
  filter: { classes: ['IfcWallStandardCase'] },
  columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
  groupBy: ['type'], sum: ['area'],
};

/** The texts of each page of a PDF, in the order they are written. */
async function pageTexts(path: string): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const doc = await task.promise;
  try {
    const pages: string[][] = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.flatMap((i) => ('str' in i && i.str.trim() ? [i.str] : [])));
    return pages;
  } finally {
    await task.destroy();
  }
}

describe.skipIf(missing !== null)('a hand-arranged project prints the same through ifcsheet_load_project as through ifcsheet build --project (#479)', () => {
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
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = (await call('tools/call', { name, arguments: args })).result!;
    expect(r.isError, `${name}: ${JSON.stringify(r.content)}`).toBeFalsy();
    return r.structuredContent;
  };

  beforeAll(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), 'ifcsheet-mcp-project-set-')));
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
    await call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'ifcsheet-project-set-test', version: '0' } });
    modelId = (await ok('ifcsheet_open_model', { file_path: FZK })).model_id;
  }, 120_000);

  afterAll(async () => {
    transport?.close();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it('every page prints the same texts, the dimension\'s figure and the schedule\'s rows among them', async () => {
    const document_id = (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;
    const saved = join(tmp, 'saved.ifclite-project.json');
    await ok('ifcsheet_save_project', { document_id, file_path: saved });

    // Edited as the app edits it.
    const doc = JSON.parse(await readFile(saved, 'utf8'));
    const plan = doc.views.find((v: any) => v.kind === 'plan');
    const sheet = doc.sheets.find((s: any) => s.viewports?.some((vp: any) => vp.viewId === plan.id));
    const vp = sheet.viewports.find((v: any) => v.viewId === plan.id);
    vp.x += 15;
    vp.y -= 10;
    const c = vp.center;
    doc.drafts = [
      { id: 'dim', viewId: plan.id, layerId: '0', shape: { type: 'dimension', variant: 'aligned', a: { x: c.x - 4.25, y: c.y }, b: { x: c.x + 4.25, y: c.y }, at: { x: c.x, y: c.y + 1 }, height: 0.25 }, params: {} },
      { id: 'note', viewId: plan.id, layerId: '0', shape: { type: 'text', p: { x: c.x, y: c.y - 2 }, text: 'Hand note', height: 0.25, rotation: 0 }, params: {} },
    ];
    doc.draftLayers = [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }];
    doc.schedules = [{ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 0, list: WALLS_BY_TYPE }];
    doc.sheets.push({ id: 'sheet-walls', number: 'X-902', name: 'Walls', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp-walls', viewId: 'walls', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] });
    const project = join(tmp, 'p.ifclite-project.json');
    await writeFile(project, JSON.stringify(doc));

    const built = await cli('build', FZK, '--project', project, '--out', join(tmp, 'cli.pdf'));
    expect(built.stderr).toContain('printing the drawing set of');
    const loaded = await ok('ifcsheet_load_project', { model_id: modelId, project_path: project });
    await ok('ifcsheet_export_pdf', { document_id: loaded.document_id, file_path: join(tmp, 'mcp.pdf') });

    const [fromCli, fromMcp] = [await pageTexts(join(tmp, 'cli.pdf')), await pageTexts(join(tmp, 'mcp.pdf'))];
    expect(fromMcp).toHaveLength(doc.sheets.length);
    expect(fromMcp).toEqual(fromCli);
    const planPage = fromMcp[doc.sheets.indexOf(sheet)];
    expect(planPage).toEqual(expect.arrayContaining(['8.50', 'Hand note']));
    expect(fromMcp[doc.sheets.length - 1]).toEqual(expect.arrayContaining(['Walls by type', 'Type', 'Count', 'NetSideArea (m²)', 'Total', '13']));
  }, 300_000);

  it('a project that records ro prints its figures in Romanian through MCP too, as the build does', async () => {
    const document_id = (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;
    const saved = join(tmp, 'saved-ro.ifclite-project.json');
    await ok('ifcsheet_save_project', { document_id, file_path: saved });
    const doc = JSON.parse(await readFile(saved, 'utf8'));
    const plan = doc.views.find((v: any) => v.kind === 'plan');
    const c = doc.sheets.flatMap((s: any) => s.viewports ?? []).find((vp: any) => vp.viewId === plan.id).center;
    doc.drafts = [{ id: 'dim', viewId: plan.id, layerId: '0', shape: { type: 'dimension', variant: 'aligned', a: { x: c.x - 4.25, y: c.y }, b: { x: c.x + 4.25, y: c.y }, at: { x: c.x, y: c.y + 1 }, height: 0.25 }, params: {} }];
    doc.draftLayers = [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }];
    const figures = async (name: string, extra: Record<string, unknown>): Promise<{ cli: string[]; mcp: string[] }> => {
      const file = join(tmp, `${name}.ifclite-project.json`);
      await writeFile(file, JSON.stringify({ ...doc, ...extra }));
      await cli('build', FZK, '--project', file, '--out', join(tmp, `${name}-cli.pdf`));
      const loaded = await ok('ifcsheet_load_project', { model_id: modelId, project_path: file });
      await ok('ifcsheet_export_pdf', { document_id: loaded.document_id, file_path: join(tmp, `${name}-mcp.pdf`) });
      const pick = async (f: string) => (await pageTexts(join(tmp, f))).flat().filter((t) => /^8[.,]50$/.test(t));
      return { cli: await pick(`${name}-cli.pdf`), mcp: await pick(`${name}-mcp.pdf`) };
    };
    expect(await figures('ro', { language: 'ro' })).toEqual({ cli: ['8,50'], mcp: ['8,50'] });
    expect(await figures('en', { language: 'en' })).toEqual({ cli: ['8.50'], mcp: ['8.50'] });
    expect(await figures('none', {})).toEqual({ cli: ['8.50'], mcp: ['8.50'] });
  }, 300_000);

  it('a Romanian project\'s room schedule and drawing register are worded in Romanian through MCP, page for page as the build prints them', async () => {
    const document_id = (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;
    const saved = join(tmp, 'saved-lists.ifclite-project.json');
    await ok('ifcsheet_save_project', { document_id, file_path: saved });
    const doc = JSON.parse(await readFile(saved, 'utf8'));
    const onSheet = (id: string, number: string, scheduleId: string) => ({ id, number, name: number, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: `vp-${id}`, viewId: scheduleId, x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] });
    doc.language = 'ro';
    doc.sheets.push(onSheet('s-rooms', 'X-903', 'rooms'), onSheet('s-reg', 'X-000', 'reg'));
    doc.schedules = [{ id: 'rooms', name: 'Încăperi', kind: 'rooms', createdAt: 0 }, { id: 'reg', name: 'Registru', kind: 'register', createdAt: 0 }];
    doc.drafts = [];
    doc.draftLayers = [];
    const file = join(tmp, 'lists.ifclite-project.json');
    await writeFile(file, JSON.stringify(doc));
    await cli('build', FZK, '--project', file, '--out', join(tmp, 'lists-cli.pdf'));
    const loaded = await ok('ifcsheet_load_project', { model_id: modelId, project_path: file });
    await ok('ifcsheet_export_pdf', { document_id: loaded.document_id, file_path: join(tmp, 'lists-mcp.pdf') });
    const [fromCli, fromMcp] = [await pageTexts(join(tmp, 'lists-cli.pdf')), await pageTexts(join(tmp, 'lists-mcp.pdf'))];
    expect(fromCli.flat()).toEqual(expect.arrayContaining(['Planșa', 'Revizie', 'Sinteza ariilor (Su, Sc, Sd)']));
    expect(fromMcp.flat()).toEqual(expect.arrayContaining(['Planșa', 'Revizie', 'Sinteza ariilor (Su, Sc, Sd)']));
  }, 300_000);

  it('content the engine does not print yet is named in the tool result, as the build names it on stderr', async () => {
    const document_id = (await ok('ifcsheet_generate_set', { model_id: modelId })).document_id as string;
    const saved = join(tmp, 'saved-left-out.ifclite-project.json');
    await ok('ifcsheet_save_project', { document_id, file_path: saved });
    const doc = JSON.parse(await readFile(saved, 'utf8'));
    // A door schedule that keeps only windows (so the model has no row for it, and the engine leaves it out) placed on a sheet of its own.
    doc.schedules = [{ id: 'doors', name: 'Doors', kind: 'door', createdAt: 0, sub: { parent: 'parent', filter: { kinds: ['window'] } } }];
    doc.sheets.push({ id: 'sheet-doors', number: 'X-903', name: 'Doors', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp-doors', viewId: 'doors', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] });
    const project = join(tmp, 'left-out.ifclite-project.json');
    await writeFile(project, JSON.stringify(doc));

    const built = await cli('build', FZK, '--project', project, '--out', join(tmp, 'left-out-cli.pdf'));
    expect(built.stderr).toContain('X-903 Doors: the door schedule "Doors" (the model has no door) not printed yet.');
    const loaded = await ok('ifcsheet_load_project', { model_id: modelId, project_path: project });
    const note = 'X-903 Doors: the door schedule "Doors" (the model has no door) not printed yet.';
    const exported = await ok('ifcsheet_export_pdf', { document_id: loaded.document_id, file_path: join(tmp, 'left-out-mcp.pdf') });
    expect(exported.notes).toEqual([note]);
    const reply = (await call('tools/call', { name: 'ifcsheet_export_pdf', arguments: { document_id: loaded.document_id, file_path: join(tmp, 'left-out-mcp2.pdf') } })).result!;
    expect(reply.content!.map((c) => c.text).join('\n')).toContain(`Not printed: ${note}`);
    const issued = await ok('ifcsheet_issue_set', { document_id: loaded.document_id, directory: join(tmp, 'issued') });
    expect(issued.notes).toEqual([note]);
    // A project that leaves nothing out says so with an empty list.
    const plain = await ok('ifcsheet_export_pdf', { document_id, file_path: join(tmp, 'plain.pdf') });
    expect(plain.notes).toEqual([]);
  }, 300_000);
});
