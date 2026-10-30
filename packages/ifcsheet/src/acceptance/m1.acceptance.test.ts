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
import type { PlanProjectView } from '../document.js';
import { openingHostsOf } from '../opening-hosts.js';
import { generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from '../headless.js';
import { planOpeningSymbols, viewOpeningSymbols } from '../plan-openings.js';
import { visibleEntities } from '../elevation-openings.js';
import { DEFAULT_JOINERY_MAPPING } from '../joinery-mapping.js';
import { resolveViewGraphics } from '../view-templates.js';
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
  /** The least door symbols the four elevations draw (a door that states its operation, facing the elevation); the count the model gave when written. */
  elevationDoorSymbols: number;
  /** Classes that some section must cut. */
  sectionCuts: string[];
  /** The GlobalIds of the doors and windows no plan draws, each for a reason given where it is listed; every other one must be drawn. */
  notDrawn: string[];
}

const CASES: Case[] = [
  {
    name: 'AC20-FZK-Haus (ArchiCAD 20, KIT)', file: here('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc'),
    storeys: ['Erdgeschoss', 'Dachgeschoss'], doors: 5, windows: 11, rooms: 7,
    sheets: [['A-101', 'Floor plans'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    emptyPlans: [], sections: 2, elevationDoorSymbols: 8, sectionCuts: ['IfcSlab', 'IfcWallStandardCase'], notDrawn: [],
  },
  {
    name: 'bloc-p4 (residential block, five storeys)', file: here('../../../../apps/viewer/public/samples/bloc-p4.ifc'),
    storeys: ['Parter', 'Etaj 1', 'Etaj 2', 'Etaj 3', 'Etaj 4'], doors: 86, windows: 89, rooms: 90,
    sheets: [['A-101', 'Floor plans 1'], ['A-102', 'Floor plans 2'], ['A-103', 'Floor plans 3'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    emptyPlans: [], sections: 2, elevationDoorSymbols: 0, sectionCuts: ['IfcSlab', 'IfcWall'], notDrawn: [],
  },
  {
    name: 'federated arch.ifc (hand-written, two levels)', file: here('../../../../apps/viewer/src/test/fixtures/federated/arch.ifc'),
    storeys: ['Level 0', 'Level 1'], doors: 1, windows: 0, rooms: 0,
    sheets: [['A-101', 'Floor plans'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    emptyPlans: [], sections: 1, elevationDoorSymbols: 2, sectionCuts: ['IfcWall'], notDrawn: [],
  },
  {
    // ara3d ISSUE_068, a Norwegian school (ARK NUS skolebygg): 56 MB, no redistribution licence stated, so it is never committed.
    // Get it with `pnpm fixtures` (tests/models/ara3d/ISSUE_068_ARK_NUS_skolebygg.ifc) or point IFCSHEET_ACCEPTANCE_SKOLEBYGG at a copy.
    name: 'ISSUE_068 skolebygg (school, optional)', file: process.env.IFCSHEET_ACCEPTANCE_SKOLEBYGG ?? here('../../../../tests/models/ara3d/ISSUE_068_ARK_NUS_skolebygg.ifc'),
    storeys: ['Plan 00U', 'Plan 01', 'Plan 02', 'Plan 03', 'Plan 04'], doors: 310, windows: 266, rooms: 307,
    sheets: [['A-101', 'Floor plans 1'], ['A-102', 'Floor plans 2'], ['A-103', 'Floor plans 3'], ['A-201', 'Elevations, south and north'], ['A-202', 'Elevations, east and west'], ['A-301', 'Sections']],
    // Plan 04 cuts nothing (roof storey). The 8 curtain wall doors, parts of an IfcCurtainWall, are drawn since #586, and the 9 doors and
    // windows that lie wholly above or below their storey plan's cut (seven wall hatches, two windows whose sill is 1 cm over Plan 01's 1.2 m cut)
    // are drawn through the host-wall rule: a plan shows the symbol of a door or window whose host wall it cuts (#586, `opening-hosts.ts`).
    // Take an id out when its element is drawn; never add one.
    emptyPlans: ['Plan 04'], sections: 2, elevationDoorSymbols: 0, sectionCuts: ['IfcSlab', 'IfcWallStandardCase'],
    notDrawn: [],
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

/** The GlobalIds of the model's elements of `type` (upper case, as the parser indexes them) that no plan shows, sorted. */
function notDrawnOf(r: Run, c: Case, ifcType: string, type: string): string[] {
  // Drawn by its cut or lines, or by its symbol: a plan draws the symbol of a door or window whose host wall it cuts, though the opening lies above or below the cut (#586).
  const drawn = new Set(r.plans.flatMap((p) => [...shown(p.drawing, ifcType)]));
  const kind = ifcType === 'IfcDoor' ? 'door' : 'window';
  for (const view of planViewsOf(r)) {
    for (const s of planSymbolsOf(r, view)) if (s.kind === kind) drawn.add(s.id);
  }
  const ids = r.model.dataStore.entityIndex.byType.get(type) ?? [];
  expect(ids).toHaveLength(type === 'IFCDOOR' ? c.doors : c.windows);
  for (const listed of c.notDrawn) expect(typeOf(r, listed), `${listed} is a door or window of the model`).toBeDefined();
  return ids.filter((id) => !drawn.has(id)).map((id) => r.model.dataStore.entities.getGlobalId(id) ?? `#${id}`).sort();
}
/** The plan views of the project: only they carry a level. */
const planViewsOf = (r: Run): PlanProjectView[] => r.set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan');
/** The door and window symbols of a plan view, as the sheets and the app make them (the default project: no configured types). */
function planSymbolsOf(r: Run, view: PlanProjectView) {
  const drawing = r.plans.find((p) => p.name === view.name)!.drawing;
  const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
  return planOpeningSymbols(r.model.buildingMeshes, drawing.config.plane, { live: { dataStore: r.model.dataStore, view: null }, project }, resolveViewGraphics(view, r.set.document.viewTemplates), view.level);
}
const typeOf = (r: Run, globalId: string): string | undefined => {
  const ds = r.model.dataStore;
  for (const type of ['IFCDOOR', 'IFCWINDOW']) if ((ds.entityIndex.byType.get(type) ?? []).some((id) => ds.entities.getGlobalId(id) === globalId)) return type;
  return undefined;
};

interface Run {
  model: OpenedModel;
  set: DefaultSet;
  plans: { name: string; drawing: Drawing2D }[];
  sections: { name: string; drawing: Drawing2D }[];
  elevations: { name: string; drawing: Drawing2D }[];
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
  return { model, set, plans: of('plan'), sections: of('section'), elevations: of('elevation'), pdf: join(out, 'set.pdf'), dxfDir: join(out, 'dxf'), stderr: err.join(''), code };
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
        expect(r.plans.reduce((n, p) => n + cutOf(p.drawing, 'IfcDoor'), 0)).toBeGreaterThan(0);
        expect(notDrawnOf(r, c, 'IfcDoor', 'IFCDOOR')).toEqual(c.notDrawn.filter((id) => typeOf(r, id) === 'IFCDOOR').sort());
      });

      it.skipIf(c.doors === 0)('draws a symbol for the doors a plan cuts: they are the doors drawn, none is left out and none is invented (#587)', () => {
        const symbolIds = new Set<number>();
        let cutDoors = 0, cutAndSymbolled = 0;
        for (const view of planViewsOf(r)) {
          const drawing = r.plans.find((p) => p.name === view.name)!.drawing;
          const doors = planSymbolsOf(r, view).filter((s) => s.kind === 'door');
          const seen = shown(drawing, 'IfcDoor');
          const hosts = openingHostsOf(r.model.dataStore);
          // A symbol is the symbol of a door the plan draws, or of one hosted in a wall the plan cuts (#586), and every door its cut passes through has one.
          for (const s of doors) { expect(seen.has(s.id) || hosts.has(s.id), `${view.name}: door ${s.id} has a symbol but the plan does not draw it`).toBe(true); symbolIds.add(s.id); }
          const have = new Set(doors.map((s) => s.id));
          const cut = new Set(drawing.cutPolygons.filter((p) => p.ifcType === 'IfcDoor').map((p) => p.entityId));
          cutDoors += cut.size;
          cutAndSymbolled += [...cut].filter((id) => have.has(id)).length;
          // A door symbol is its swing and leaf: shapes, not an empty mark.
          for (const s of doors) expect(s.shapes.length + (s.heavy?.length ?? 0), `${view.name}: door ${s.id} symbol`).toBeGreaterThan(0);
        }
        expect(symbolIds.size, 'door symbols').toBeGreaterThan(0);
        expect(symbolIds.size, 'every door the plans draw has a symbol').toBeGreaterThanOrEqual(c.doors - c.notDrawn.filter((id) => typeOf(r, id) === 'IFCDOOR').length);
        expect(cutDoors).toBeGreaterThan(0);
        expect(cutAndSymbolled, 'the doors a plan cuts that have a symbol').toBe(cutDoors);
      });

      it.skipIf(c.doors + c.windows === 0)('prints the symbols on the sheets in place of the doors\' and windows\' cut: a SYMBOLS pen on the floor plan sheets (#587)', async () => {
        const sheets = await sheetGraphics(r.set, r.model);
        const symbolRuns = sheets.flatMap((s) => s.pens.filter((p) => p.layer === 'SYMBOLS')).reduce((n, p) => n + p.runs.length, 0);
        expect(symbolRuns, 'symbol runs on the sheets').toBeGreaterThan(0);
        expect(sheets.some((s) => s.pens.some((p) => p.layer === 'SYMBOLS' && p.runs.length > 0 && !p.dash)), 'a solid symbol pen').toBe(true);
      }, 600_000);

      it.skipIf(c.doors === 0)('draws the opening lines of the doors the elevations see, over the drawing (#587)', async () => {
        const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
        expect(r.elevations.length, 'elevations').toBe(4);
        let doors = 0;
        for (const view of r.set.document.views.filter((v) => v.kind === 'elevation')) {
          const drawing = r.elevations.find((e) => e.name === view.name)!.drawing;
          const symbols = viewOpeningSymbols(r.model.buildingMeshes, drawing.config.plane, drawing, { live: { dataStore: r.model.dataStore, view: null }, project }, resolveViewGraphics(view, r.set.document.viewTemplates));
          const seen = visibleEntities(drawing);
          // A symbol is the symbol of a door or window the elevation shows, and is strokes, not an empty mark; an untyped window has none.
          for (const s of symbols) {
            expect(seen.has(s.id), `${view.name}: ${s.kind} ${s.id} has a symbol but the elevation does not show it`).toBe(true);
            expect(s.shapes.length + (s.dashed?.length ?? 0) + (s.heavy?.length ?? 0), `${view.name}: ${s.kind} ${s.id} symbol`).toBeGreaterThan(0);
            expect(s.kind, `${view.name}: ${s.id} is an untyped door, as no type is configured here`).toBe('door');
          }
          doors += symbols.length;
        }
        expect(doors, 'door symbols on the elevations').toBeGreaterThanOrEqual(c.elevationDoorSymbols);
        // The sheets carry them: the elevation sheets (A-2xx) have a SYMBOLS pen exactly when the elevations have symbols.
        const sheets = await sheetGraphics(r.set, r.model);
        const onElevations = sheets.filter((sh) => /^A-20/.test(sh.number)).reduce((n, sh) => n + sh.pens.filter((p) => p.layer === 'SYMBOLS').reduce((m, p) => m + p.runs.length, 0), 0);
        expect(onElevations > 0, 'symbol runs on the elevation sheets').toBe(doors > 0);
      }, 600_000);

      it.skipIf(c.windows === 0)('cuts the windows and draws them on the plans', () => {
        expect(r.plans.reduce((n, p) => n + cutOf(p.drawing, 'IfcWindow'), 0)).toBeGreaterThan(0);
        expect(notDrawnOf(r, c, 'IfcWindow', 'IFCWINDOW')).toEqual(c.notDrawn.filter((id) => typeOf(r, id) === 'IFCWINDOW').sort());
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
