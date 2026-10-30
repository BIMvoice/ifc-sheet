/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Milestone 1 acceptance set (#557): a fixed set of real models, and per model a headless check of what must be right on its plans,
 * sections and schedules. The models, their licences and what each one checks are listed in `docs/guide/acceptance-set.md`.
 *
 * Every figure below is the model's own: the door, window, room and storey counts are asserted against the parsed file first, then the
 * drawings are held to them. A figure that an empty or broken drawing would also produce (zero windows in a model with none) is not asserted.
 *
 * Models too large to commit are looked up by path and the suite skips them cleanly when absent (`pnpm fixtures` fetches the manifest's).
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import DxfParserModule from 'dxf-parser';
import type { DxfParser as DxfParserInstance } from 'dxf-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { EXIT, run } from '../cli.js';
import { generateDefaultSet, type DefaultSet } from '../default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from '../headless.js';
import { readRooms } from '../room-read.js';
import { roomSchedule } from '../room-schedule.js';
import { drawingRegisterRows } from '../drawing-register.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from '../project-version.js';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const WASM = here('../../../wasm/pkg/ifc-lite_bg.wasm');
const DxfParser = DxfParserModule as unknown as new () => DxfParserInstance;

interface Case {
  name: string;
  /** Where the model is; a model under `tests/models` is fetched by `pnpm fixtures` and skipped when absent. */
  file: string;
  /** What the model holds, read from the file by `grep -c`-style counts of its entities. */
  storeys: string[];
  doors: number;
  windows: number;
  rooms: number;
  /** The default set's sheets, number and name, in order. */
  sheets: [string, string][];
  /** Plans whose cut passes through nothing (the storey is above or below what the model has there). */
  emptyPlans: string[];
  sections: number;
  /** Classes that some section must cut. */
  sectionCuts: string[];
  /** Part of the doors and windows the plans do not draw yet; their share that must be drawn (1 = all of them). */
  drawnShare: number;
}

const CASES: Case[] = [
  {
    name: 'AC20-FZK-Haus (ArchiCAD 20, KIT)', file: here('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc'),
    storeys: ['Erdgeschoss', 'Dachgeschoss'], doors: 5, windows: 11, rooms: 7,
    sheets: [['A-101', 'Floor plans'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    emptyPlans: [], sections: 2, sectionCuts: ['IfcSlab', 'IfcWallStandardCase'], drawnShare: 1,
  },
  {
    name: 'bloc-p4 (residential block, five storeys)', file: here('../../../../apps/viewer/public/samples/bloc-p4.ifc'),
    storeys: ['Parter', 'Etaj 1', 'Etaj 2', 'Etaj 3', 'Etaj 4'], doors: 86, windows: 89, rooms: 90,
    sheets: [['A-101', 'Floor plans 1'], ['A-102', 'Floor plans 2'], ['A-103', 'Floor plans 3'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    emptyPlans: [], sections: 2, sectionCuts: ['IfcSlab', 'IfcWall'], drawnShare: 1,
  },
  {
    name: 'federated arch.ifc (hand-written, two levels)', file: here('../../../../apps/viewer/src/test/fixtures/federated/arch.ifc'),
    storeys: ['Level 0', 'Level 1'], doors: 1, windows: 0, rooms: 0,
    sheets: [['A-101', 'Floor plans'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    emptyPlans: [], sections: 1, sectionCuts: ['IfcWall'], drawnShare: 1,
  },
  {
    // ara3d ISSUE_068, a Norwegian school (ARK NUS skolebygg): 56 MB, no redistribution licence stated, so it is never committed.
    // Get it with `pnpm fixtures` (tests/models/ara3d/ISSUE_068_ARK_NUS_skolebygg.ifc) or point IFCSHEET_ACCEPTANCE_SKOLEBYGG at a copy.
    name: 'ISSUE_068 skolebygg (school, optional)', file: process.env.IFCSHEET_ACCEPTANCE_SKOLEBYGG ?? here('../../../../tests/models/ara3d/ISSUE_068_ARK_NUS_skolebygg.ifc'),
    storeys: ['Plan 00U', 'Plan 01', 'Plan 02', 'Plan 03', 'Plan 04'], doors: 310, windows: 266, rooms: 307,
    sheets: [['A-101', 'Floor plans 1'], ['A-102', 'Floor plans 2'], ['A-103', 'Floor plans 3'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    // Plan 04 cuts nothing (roof storey). Measured 2026-10-30: the plans draw 295 of 310 doors and 264 of 266 windows; the rest sit
    // where no plan's cut reaches them. Raise the share when that is fixed, never lower it.
    emptyPlans: ['Plan 04'], sections: 2, sectionCuts: ['IfcSlab', 'IfcWallStandardCase'], drawnShare: 0.9,
  },
];

const missingWasm = !existsSync(WASM) && !process.env.CI;
if (missingWasm) console.warn('[ifcsheet] skipping the acceptance set: wasm bundle not built (`pnpm build:wasm:fetch`)');

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const scratch = (): string => { const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-acceptance-')); dirs.push(dir); return dir; };

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

/** The ids of the elements of `ifcType` a drawing shows (cut or seen). */
function shown(drawing: Drawing2D, ifcType: string): Set<number> {
  return new Set([...drawing.cutPolygons, ...drawing.lines].filter((e) => e.ifcType === ifcType).map((e) => e.entityId));
}
const cutOf = (drawing: Drawing2D, ifcType: string): number => drawing.cutPolygons.filter((p) => p.ifcType === ifcType).length;

interface Run {
  model: OpenedModel;
  set: DefaultSet;
  plans: { name: string; drawing: Drawing2D }[];
  sections: { name: string; drawing: Drawing2D }[];
  pdf: string;
  dxfDir: string;
  stderr: string;
  code: number;
}

/** Opens the model, cuts its starting set's views, then prints that set with the register as a project through the command line. */
async function runCase(c: Case): Promise<Run> {
  const model = await openModel(new Uint8Array(readFileSync(c.file)));
  const set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 30) });
  if (!set || !model.extent) throw new Error(`${c.name}: no set: the model has no extent`);
  const drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent, (view, error) => { throw new Error(`${c.name}: ${view.name} did not draw: ${String(error)}`); });
  const of = (kind: string) => set.document.views.filter((v) => v.kind === kind).map((v) => ({ name: v.name, drawing: drawings.get(v.id)! }));
  // The saved project: the set's own views and sheets, and a sheet for the drawing register.
  const doc = set.document;
  const register = { id: 'sheet-register', number: 'R-001', name: 'Drawing register', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'vp-register', viewId: 'register', x: 200, y: 140, scale: 50, width: 0, height: 0, center: null }] };
  const project = join(scratch(), 'acceptance.ifclite-project.json');
  writeFileSync(project, JSON.stringify({
    format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: c.name,
    views: doc.views, viewTemplates: doc.viewTemplates, titleBlock: doc.titleBlock,
    sheets: [register, ...doc.sheets], schedules: [{ id: 'register', name: 'Drawing register', kind: 'register', createdAt: 0 }],
  }));
  const out = scratch();
  const err: string[] = [];
  const code = await run(['build', c.file, '--project', project, '--out', join(out, 'set.pdf'), '--dxf', join(out, 'dxf')], { stdout: () => {}, stderr: (t) => void err.push(t) });
  return { model, set, plans: of('plan'), sections: of('section'), pdf: join(out, 'set.pdf'), dxfDir: join(out, 'dxf'), stderr: err.join(''), code };
}

describe.skipIf(missingWasm)('Milestone 1 acceptance set (#557)', () => {
  for (const c of CASES) {
    const absent = existsSync(c.file) ? null : `${c.file} not found: run \`pnpm fixtures\``;
    if (absent) console.warn(`[ifcsheet] skipping the acceptance model ${c.name}: ${absent}`);
    describe.skipIf(absent !== null)(c.name, () => {
      let r: Run;
      beforeAll(async () => { r = await runCase(c); }, 600_000);

      it('is the model the checks below were written for', () => {
        const byType = r.model.dataStore.entityIndex.byType;
        expect(r.model.storeys.map((s) => s.name).sort()).toEqual([...c.storeys].sort());
        expect(byType.get('IFCDOOR')?.length ?? 0).toBe(c.doors);
        expect(byType.get('IFCWINDOW')?.length ?? 0).toBe(c.windows);
      });

      it('has a plan for each storey, with cut walls on every plan that passes through the building', () => {
        expect(r.plans.map((p) => p.name).sort()).toEqual([...c.storeys].sort());
        const walls = (p: Run['plans'][number]) => cutOf(p.drawing, 'IfcWall') + cutOf(p.drawing, 'IfcWallStandardCase');
        for (const plan of r.plans.filter((p) => !c.emptyPlans.includes(p.name))) expect(walls(plan), `${plan.name}: cut walls`).toBeGreaterThan(0);
        for (const plan of r.plans.filter((p) => c.emptyPlans.includes(p.name))) expect(walls(plan), `${plan.name}: cut walls`).toBe(0);
      });

      it.skipIf(c.doors === 0)('cuts the doors and draws them on the plans', () => {
        const drawn = new Set(r.plans.flatMap((p) => [...shown(p.drawing, 'IfcDoor')]));
        expect(r.plans.reduce((n, p) => n + cutOf(p.drawing, 'IfcDoor'), 0)).toBeGreaterThan(0);
        expect(drawn.size).toBeGreaterThanOrEqual(Math.ceil(c.doors * c.drawnShare));
        expect(drawn.size).toBeLessThanOrEqual(c.doors);
      });

      it.skipIf(c.windows === 0)('cuts the windows and draws them on the plans', () => {
        const drawn = new Set(r.plans.flatMap((p) => [...shown(p.drawing, 'IfcWindow')]));
        expect(r.plans.reduce((n, p) => n + cutOf(p.drawing, 'IfcWindow'), 0)).toBeGreaterThan(0);
        expect(drawn.size).toBeGreaterThanOrEqual(Math.ceil(c.windows * c.drawnShare));
        expect(drawn.size).toBeLessThanOrEqual(c.windows);
      });

      it('has sections with cut faces, through the classes that must be cut', () => {
        expect(r.sections).toHaveLength(c.sections);
        for (const section of r.sections) expect(section.drawing.cutPolygons.length, `${section.name}: cut faces`).toBeGreaterThan(0);
        for (const ifcType of c.sectionCuts) expect(r.sections.reduce((n, s) => n + cutOf(s.drawing, ifcType), 0), `${ifcType} cut by a section`).toBeGreaterThan(0);
      });

      it.skipIf(c.rooms === 0)('has the model\'s rooms in the room schedule', () => {
        const read = readRooms(r.model.dataStore, r.model.meshes);
        expect(roomSchedule(read.levels, read.rooms).rooms).toBe(c.rooms);
      });

      it('lists the set\'s sheets, in set order, in the drawing register', () => {
        expect(r.set.document.sheets.map((s) => [s.number, s.name])).toEqual(c.sheets);
        const rows = drawingRegisterRows({ sheets: r.set.document.sheets });
        expect(rows.map((row) => [row.number, row.title])).toEqual(c.sheets);
      });

      it('prints the set with `build --project`: a PDF page and a DXF per sheet, the register page naming every sheet', async () => {
        expect(r.stderr).toContain(`printing the drawing set of`);
        expect(r.stderr).toContain(`${c.sheets.length + 1} sheets`);
        expect(r.code, r.stderr.slice(0, 500)).toBe(EXIT.ok);
        const pages = await pageTexts(r.pdf);
        expect(pages).toHaveLength(c.sheets.length + 1);
        expect(pages[0]).toEqual(expect.arrayContaining(['Drawing register', ...c.sheets.map(([number]) => number), ...c.sheets.map(([, name]) => name)]));
        const files = readdirSync(r.dxfDir).sort();
        expect(files).toEqual(['R-001.dxf', ...c.sheets.map(([number]) => `${number}.dxf`)].sort());
        for (const file of files) expect(new DxfParser().parseSync(readFileSync(join(r.dxfDir, file), 'utf8'))?.entities.length, file).toBeGreaterThan(0);
      });
    });
  }
});
