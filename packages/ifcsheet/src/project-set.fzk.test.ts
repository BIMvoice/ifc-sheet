/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build --project` prints the project's own drawing set (#479), on AC20-FZK-Haus through the command line a person runs:
 * a project whose sheets were arranged by hand (one plan sheet renumbered and renamed, its viewport moved, a dimension and a text on
 * its plan, a list schedule placed on a sheet of its own) prints those two sheets and nothing else, with the dimension's figure and
 * the schedule's rows; a project with no sheet gets the starting set; the build says on stderr which one it printed. The app's side
 * of the same check, against the app's sheet SVG, is `apps/viewer/src/project/cli-project-set.fzk.test.tsx`.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { generateDefaultSet } from './default-set.js';
import type { ProjectDocument } from './document.js';
import { openModel } from './model.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

const WALLS_BY_TYPE = {
  filter: { classes: ['IfcWallStandardCase'] },
  columns: [{ id: 'type', source: 'attribute', propertyName: 'Type' }, { id: 'area', source: 'quantity', psetName: 'BaseQuantities', propertyName: 'NetSideArea' }],
  groupBy: ['type'], sum: ['area'],
};

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-projectset-')); dirs.push(dir); return dir; };
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const writeProject = (body: Record<string, unknown>): string => {
  const path = join(scratch(), 'p.ifclite-project.json');
  writeFileSync(path, JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Haus', ...body }));
  return path;
};

async function pageTexts(pdf: string): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdf)), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const doc = await task.promise;
  try {
    const pages: string[][] = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).filter((t) => t.trim() !== ''));
    return pages;
  } finally {
    await task.destroy();
  }
}

async function build(project: string): Promise<{ code: number; err: string; pages: string[][] }> {
  const out = join(scratch(), 'set.pdf');
  const c = capture();
  const code = await run(['build', FZK, '--project', project, '--out', out], c.io);
  return { code, err: c.err(), pages: code === EXIT.ok ? await pageTexts(out) : [] };
}

describe.skipIf(missing !== null)('ifcsheet build --project prints the project\'s own set, on AC20-FZK-Haus (#479)', () => {
  let doc: ProjectDocument;
  let generatedSheets: number;

  beforeAll(async () => {
    const set = generateDefaultSet(await openModel(new Uint8Array(readFileSync(FZK))), { now: 0 });
    expect(set).not.toBeNull();
    doc = set!.document;
    generatedSheets = doc.sheets.length;
  }, 120_000);

  /** The set as the app would save it after a hand edit: the ground plan's sheet alone, renumbered and moved, a dimension and a text on the plan, a list schedule on a sheet of its own. */
  function arranged(): Record<string, unknown> {
    const plan = doc.views.find((v) => v.kind === 'plan')!;
    const sheet = doc.sheets.find((s) => s.viewports?.some((vp) => vp.viewId === plan.id))!;
    const vp = sheet.viewports!.find((v) => v.viewId === plan.id)!;
    const c = vp.center!;
    return {
      views: doc.views, viewTemplates: doc.viewTemplates, titleBlock: doc.titleBlock,
      sheets: [
        { ...sheet, number: 'X-901', name: 'Hand arranged', viewports: [{ ...vp, x: vp.x + 15, y: vp.y - 10 }] },
        { id: 'sheet-walls', number: 'X-902', name: 'Walls', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp-walls', viewId: 'walls', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] },
      ],
      drafts: [
        { id: 'dim', viewId: plan.id, layerId: '0', shape: { type: 'dimension', variant: 'aligned', a: { x: c.x - 4.25, y: c.y }, b: { x: c.x + 4.25, y: c.y }, at: { x: c.x, y: c.y + 1 }, height: 0.25 }, params: {} },
        { id: 'note', viewId: plan.id, layerId: '0', shape: { type: 'text', p: { x: c.x, y: c.y - 2 }, text: 'Hand note', height: 0.25, rotation: 0 }, params: {} },
      ],
      draftLayers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }],
      schedules: [{ id: 'walls', name: 'Walls by type', kind: 'list', createdAt: 0, list: WALLS_BY_TYPE }],
    };
  }

  it('prints the two sheets the project holds, with the dimension, the text and the schedule\'s rows, and says so', async () => {
    const { code, err, pages } = await build(writeProject(arranged()));
    expect(code).toBe(EXIT.ok);
    expect(err).toContain('printing the drawing set of');
    expect(err).toContain('2 sheets');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(expect.arrayContaining(['X-901', 'Hand arranged', '8.50', 'Hand note']));
    expect(pages[1]).toEqual(expect.arrayContaining(['X-902', 'Walls by type', 'Type', 'Count', 'NetSideArea (m²)', 'Total', '13']));
  }, 240_000);

  it('prints the rooms schedule, the bill of quantities and the drawing register where they were placed, and names the kinds it still leaves out', async () => {
    const onSheet = (id: string, number: string, scheduleId: string) => ({ id, number, name: number, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: `vp-${id}`, viewId: scheduleId, x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] });
    const base = arranged();
    const project = {
      ...base,
      sheets: [...(base.sheets as unknown[]), onSheet('s-rooms', 'X-903', 'rooms'), onSheet('s-boq', 'X-904', 'boq'), onSheet('s-reg', 'X-000', 'reg'), onSheet('s-door', 'X-905', 'doors')],
      schedules: [
        ...(base.schedules as unknown[]),
        { id: 'rooms', name: 'Room schedule', kind: 'rooms', createdAt: 0 },
        { id: 'boq', name: 'Bill of quantities', kind: 'boq', createdAt: 0 },
        { id: 'reg', name: 'Drawing register', kind: 'register', createdAt: 0 },
        { id: 'doors', name: 'Doors', kind: 'door', createdAt: 0 },
      ],
      boqArticles: [{ id: 'a1', code: 'EXAMPLE-001', description: 'EXAMPLE: wall faces', unit: 'm2', filter: { classes: ['IfcWallStandardCase'] }, quantity: 'NetSideArea', factor: 1 }],
    };
    const { code, err, pages } = await build(writeProject(project));
    expect(code).toBe(EXIT.ok);
    expect(pages).toHaveLength(6);
    expect(pages[2]).toEqual(expect.arrayContaining(['Room schedule', 'Total building (Au)', 'Area summary (Su, Sc, Sd)']));
    expect(pages[3]).toEqual(expect.arrayContaining(['Bill of quantities', 'Article code', 'EXAMPLE-001']));
    expect(pages[4]).toEqual(expect.arrayContaining(['Drawing register', 'Sheet', 'Revision', 'X-901', 'X-905']));
    for (const printed of ['rooms schedule', 'boq schedule', 'register schedule']) expect(err).not.toContain(printed);
    expect(err).toContain('X-905 X-905: the door schedule "Doors" not printed yet');
  }, 240_000);

  it('a project with no sheet gets the starting set, and says so', async () => {
    const { code, err, pages } = await build(writeProject({}));
    expect(code).toBe(EXIT.ok);
    expect(err).toContain('holds no drawing set (no sheet); laying out a fresh one');
    expect(pages).toHaveLength(generatedSheets);
  }, 240_000);

  it('refuses a project whose view the app would refuse, with the app\'s message', async () => {
    const c = capture();
    expect(await run(['build', FZK, '--project', writeProject({ views: [{ id: 'v', name: 'Plan', kind: 'plan' }] }), '--out', join(scratch(), 'x.pdf')], c.io)).toBe(EXIT.failed);
    expect(c.err()).toContain('Not a project file: /views/0.cutHeight must be a number');
  }, 60_000);
});
