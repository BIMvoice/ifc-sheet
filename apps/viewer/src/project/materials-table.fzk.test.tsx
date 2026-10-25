/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The building materials table (#90) on AC20-FZK-Haus, through the real pipeline: the parser, the wasm geometry, the section
 * generator, the default drawing set, `useSheetContent` (what the Wall and the PDF/DXF draw a sheet from) and the sheet's pens.
 *
 * The walls of the model are made of "Leichtbeton 102890359" (the layer sets "Leichtbeton 102890359 0.24" and "... 0.3", one layer
 * each) and its slabs of "Stahlbeton 65690" (the sections cut the slabs' IfcSlabType objects, which carry no material association, so only the walls
 * are drawn by material here). The geometry engine cuts an element of one material in one piece, so a project
 * with no row for a material draws no material hatch there (as it always did); a row makes the walls draw by it, on every sheet.
 */

import '@/test/setup-dom.js';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { useSheetContent, type SheetContent } from '@/components/viewer/sheets/useSheetContent';
import { useViewerStore } from '@/store';
import { startDrawingSet } from './drawing-set-actions';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvedMaterial } from '@bimvoice/ifcsheet/materials';
import { materialGraphics, materialNamesInModels, resetAllMaterials, resetMaterial, setMaterial } from './materials';
import { parseProjectFile, serializeProject } from './project-file';
import { materialSwatch } from './material-swatch';
import { duplicateProjectSheet, loadProjectDocument, projectDocument, useProjectStore } from './project-store';
import { useViewDrawings } from './view-drawings';
import type { StyledDrawing } from './view-graphics';
import type { ProjectSheet, SheetViewport } from './types';

const skip = planModelMissing(FZK_HAUS);
/** The material the model's walls are made of, and the one its slabs are made of. */
const WALL_MATERIAL = 'Leichtbeton 102890359';
const SLAB_MATERIAL = 'Stahlbeton 65690';

let m: LoadedPlanModel;
let drawings: Record<string, Drawing2D> = {};

/** The hook of each mounted sheet, replaced on every render, so a read is what the sheet draws now. */
const hooks = new Map<string, SheetContent>();
function Probe({ sheet }: { sheet: ProjectSheet }) {
  hooks.set(sheet.id, useSheetContent(sheet));
  return null;
}

/** A sheet as the Wall draws it: the content hook feeding the sheet's SVG, one mount that stays while the table is edited. */
function Paper({ sheet }: { sheet: ProjectSheet }) {
  const content = useSheetContent(sheet);
  hooks.set(sheet.id, content);
  return <SheetPaper sheet={sheet} projectName="FZK" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={content.content} />;
}
const planSheet = (): ProjectSheet => sheetsWithViews().find((s) => (s.viewports ?? []).some((vp) => useProjectStore.getState().views.find((v) => v.id === vp.viewId)?.kind === 'plan'))!;

const sheetsWithViews = (): ProjectSheet[] => useProjectStore.getState().sheets.filter((s) => (s.viewports ?? []).some((vp) => drawings[vp.viewId]));
const drawn = (sheet: ProjectSheet, vp: SheetViewport): StyledDrawing => hooks.get(sheet.id)!.content(vp).drawing as StyledDrawing;
/** Every cut face of a wall with the hatch of the material's, per sheet viewport: `[sheet number, view name, hatch pattern]`. */
function wallHatches(of = 'IfcWall'): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const sheet of sheetsWithViews()) {
    for (const vp of sheet.viewports ?? []) {
      if (!drawings[vp.viewId]) continue;
      const view = useProjectStore.getState().views.find((v) => v.id === vp.viewId)!;
      for (const h of drawn(sheet, vp)?.materialHatches ?? []) if (h.entityId !== undefined && m.classOf(h.entityId).startsWith(of)) out.push([sheet.number, view.name, h.pattern]);
    }
  }
  return out;
}
const mountAll = (): void => void render(<>{sheetsWithViews().map((s) => <Probe key={s.id} sheet={s} />)}</>);

before(async () => {
  if (skip) return;
  m = await loadPlanModel(FZK_HAUS);
  const model = useViewerStore.getState().models.get('m')!;
  startDrawingSet(model.geometryResult!.meshes, model.geometryResult!.coordinateInfo.shiftedBounds);
  // The ground and top floor plans are on A-101; a copy of that sheet hangs the same drawings a second time.
  const plans = useProjectStore.getState().sheets.find((x) => (x.viewports ?? []).some((vp) => useProjectStore.getState().views.find((v) => v.id === vp.viewId)?.kind === 'plan'))!;
  assert.ok(duplicateProjectSheet(plans.id));
  for (const view of useProjectStore.getState().views) {
    if (view.kind !== 'plan' && view.kind !== 'elevation' && view.kind !== 'section') continue;
    drawings[view.id] = await m.planOf(view, { omits: 'none' });
  }
});

beforeEach(() => {
  if (skip) return;
  useProjectStore.setState({ materials: [], dirty: false });
  clearDraftHistory();
  useViewDrawings.setState({ byView: Object.fromEntries(Object.entries(drawings).map(([id, drawing]) => [id, { drawing, status: 'ready', progress: 100, phase: '', error: null }])) });
});
afterEach(() => {
  cleanup();
  hooks.clear();
});

describe('the model and its default set', { skip }, () => {
  it('has walls to cut, and a set of sheets to draw them on', () => {
    assert.ok(sheetsWithViews().length >= 3, 'plans, elevations and sections are on sheets');
    assert.ok(Object.values(drawings).length > 5, 'with their drawings');
    const classes = new Set(Object.values(drawings).flatMap((d) => d.cutPolygons.map((p) => m.classOf(p.entityId))));
    assert.ok([...classes].some((c) => c.startsWith('IfcWall')), `walls are cut: ${[...classes].join(', ')}`);
  });
});

describe('a project with no row for a material draws as it always did', { skip }, () => {
  it('no sheet carries a material hatch on FZK: its walls are cut in one piece', () => {
    mountAll();
    assert.deepEqual(wallHatches(), []);
    for (const sheet of sheetsWithViews()) for (const vp of sheet.viewports ?? []) {
      if (drawings[vp.viewId]) assert.equal(drawn(sheet, vp)?.materialHatches, undefined, `${sheet.number}: no material hatches`);
    }
  });
});

describe('changing the hatch of a material changes it on every sheet', { skip }, () => {
  it(`gives the walls of ${WALL_MATERIAL} the new hatch on every sheet that cuts one, and a later change replaces it after a re-render`, () => {
    mountAll();
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'BRICK' }));
    const first = wallHatches();
    assert.ok(first.length > 0, 'walls are hatched');
    assert.deepEqual([...new Set(first.map((h) => h[2]))], ['BRICK'], 'with the new hatch and no other');
    const sheetsCutting = sheetsWithViews().filter((s) => (s.viewports ?? []).some((vp) => drawings[vp.viewId]?.cutPolygons.some((p) => m.classOf(p.entityId).startsWith('IfcWall'))));
    assert.ok(sheetsCutting.length >= 2, `walls are cut on several sheets: ${sheetsCutting.map((x) => x.number).join(', ')}`);
    for (const s of sheetsCutting) assert.ok(first.some((h) => h[0] === s.number), `${s.number} draws its walls with the hatch`);

    // The same drawings, drawn again after another edit: the caches follow the table, nothing answers with the old hatch.
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'STEEL' }));
    assert.deepEqual([...new Set(wallHatches().map((h) => h[2]))], ['STEEL']);
    assert.equal(wallHatches().length, first.length, 'the same faces, hatched again');
  });

  it('the sheet SVG draws the hatch lines, and different lines for a different hatch', () => {
    const sheet = planSheet();
    const ui = render(<Paper sheet={sheet} />);
    const hatchLines = (): string[] => [...ui.querySelectorAll('path[data-dxf-layer="HATCH"]')].map((p) => p.getAttribute('d') ?? '');
    assert.deepEqual(hatchLines(), [], 'no hatch before the edit');
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'BRICK' }));
    const brick = hatchLines();
    assert.ok(brick.length > 0 && brick.every((d) => d.length > 100), 'hatch lines are drawn');
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'STEEL' }));
    const steel = hatchLines();
    assert.ok(steel.length > 0);
    assert.notDeepEqual(steel, brick, 'a different hatch draws different lines');
  });

  it('a fill set on the material fills the cut faces of its walls on the sheet', () => {
    const ui = render(<Paper sheet={planSheet()} />);
    const fills = (): Set<string | null> => new Set([...ui.querySelectorAll('path[data-dxf-layer="FILL"]')].map((p) => p.getAttribute('fill')));
    assert.ok(!fills().has('#ffcc00'));
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'BRICK', fill: '#ffcc00' }));
    assert.ok(fills().has('#ffcc00'), `the walls are filled with the material's colour: ${[...fills()].join(', ')}`);
  });
});

describe('the swatch is the sheet\'s drawing of the material', { skip }, () => {
  it('draws with the pattern, scale and pen the walls have on the sheet, and follows an edit of any of them', () => {
    mountAll();
    const ui = render(<Paper sheet={planSheet()} />);
    const sheetPen = (): string[] => [...new Set([...ui.querySelectorAll('path[data-dxf-layer="HATCH"]')].map((p) => p.getAttribute('data-dxf-lw') ?? ''))];
    for (const edit of [{ hatch: 'BRICK', hatchPen: 'light' }, { hatch: 'STEEL', hatchPen: 'heavy', hatchScale: 2 }] as const) {
      act(() => setMaterial(WALL_MATERIAL, edit));
      const swatch = materialSwatch(materialGraphics(WALL_MATERIAL), []).pens.filter((p) => p.layer === 'HATCH');
      assert.equal(swatch.length, 1);
      assert.deepEqual(sheetPen(), [String(swatch[0].width)], 'the same pen on the sheet and in the swatch');
      const onSheet = [...new Set(wallHatches().map((h) => h[2]))];
      assert.deepEqual(onSheet, [edit.hatch]);
      assert.equal(materialGraphics(WALL_MATERIAL).hatch, edit.hatch);
    }
  });
});

describe('reset and undo', { skip }, () => {
  it('reset puts the guessed default back: the row goes, and the walls draw as before', () => {
    mountAll();
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'BRICK' }));
    assert.ok(wallHatches().length > 0);
    act(() => resetMaterial(WALL_MATERIAL));
    assert.deepEqual(useProjectStore.getState().materials, []);
    assert.deepEqual(wallHatches(), []);
    const guess = materialGraphics(WALL_MATERIAL);
    assert.equal(guess.auto, true);
    assert.equal(guess.hatch, 'CONCRETE', 'a name with "beton" suggests concrete');
  });

  it('reset all takes every row away in one step', () => {
    setMaterial(WALL_MATERIAL, { hatch: 'BRICK' });
    setMaterial(SLAB_MATERIAL, { hatch: 'STEEL' });
    clearDraftHistory();
    resetAllMaterials();
    assert.deepEqual(useProjectStore.getState().materials, []);
    assert.equal(undoDrafts(), true);
    assert.equal(useProjectStore.getState().materials?.length, 2, 'one undo brings both back');
    assert.equal(undoDrafts(), false);
  });

  it('undo restores the previous hatch on the sheets, step by step, and redo reapplies it', () => {
    mountAll();
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'BRICK' }));
    act(() => setMaterial(WALL_MATERIAL, { hatch: 'STEEL' }));
    assert.deepEqual([...new Set(wallHatches().map((h) => h[2]))], ['STEEL']);
    act(() => void undoDrafts());
    assert.deepEqual([...new Set(wallHatches().map((h) => h[2]))], ['BRICK'], 'one undo is one edit');
    assert.equal(materialGraphics(WALL_MATERIAL).hatch, 'BRICK');
    act(() => void undoDrafts());
    assert.deepEqual(wallHatches(), [], 'the first edit undone: no row, the walls as before');
    act(() => void redoDrafts());
    assert.deepEqual([...new Set(wallHatches().map((h) => h[2]))], ['BRICK']);
  });
});


const ENGINE_BIN = fileURLToPath(new URL('../../../../packages/ifcsheet/dist/bin.js', import.meta.url));

describe('the engine and the app read the same project the same way', { skip: skip || (!existsSync(ENGINE_BIN) && 'the engine is not built: run `pnpm turbo run build --filter=@bimvoice/ifcsheet`') }, () => {
  interface Row { name: string; auto: boolean; hatch: string | null; hatchScale: number; fill: string; hatchPen: string; membrane: boolean }
  const engineSays = (projectText: string): Row[] => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-materials-'));
    try {
      writeFileSync(join(dir, 'p.ifclite-project.json'), projectText);
      const out = execFileSync(process.execPath, [ENGINE_BIN, 'materials', FZK_HAUS, '--project', join(dir, 'p.ifclite-project.json'), '--json'], { encoding: 'utf8' });
      return (JSON.parse(out) as { materials: Row[] }).materials;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('`ifcsheet materials --project` resolves every material of FZK as the app resolves it, from the file the app saved', () => {
    setMaterial(WALL_MATERIAL, { hatch: 'BRICK', hatchScale: 2, hatchPen: 'heavy', fill: '#ffcc00' });
    setMaterial('Holz', { membrane: true });
    const saved = serializeProject(projectDocument());
    const rows = engineSays(saved);
    assert.deepEqual(rows.map((r) => r.name), materialNamesInModels(), 'the same materials, in the same order');
    // The app's side is read back from the file too, as a person who opens it gets it.
    loadProjectDocument(parseProjectFile(saved), { dirty: false });
    for (const row of rows) assert.deepEqual(row, resolvedMaterial(materialGraphics(row.name)), row.name);
    const wall = rows.find((r) => r.name === WALL_MATERIAL)!;
    assert.deepEqual([wall.hatch, wall.hatchScale, wall.hatchPen, wall.fill, wall.auto], ['BRICK', 2, 'heavy', '#ffcc00', false]);
    assert.equal(rows.find((r) => r.name === 'Holz')!.membrane, true);
    assert.equal(rows.find((r) => r.name === SLAB_MATERIAL)!.auto, true, 'a material with no row is guessed from its name');
  });

  it('and draws the hatch the engine reports: the pattern, scale and pen on the FZK walls are the engine\'s', () => {
    setMaterial(WALL_MATERIAL, { hatch: 'BRICK', hatchScale: 2, hatchPen: 'heavy' });
    const engine = engineSays(serializeProject(projectDocument())).find((r) => r.name === WALL_MATERIAL)!;
    mountAll();
    const hatches = sheetsWithViews().flatMap((sheet) => (sheet.viewports ?? []).flatMap((vp) => (drawn(sheet, vp)?.materialHatches ?? []).filter((h) => m.classOf(h.entityId!).startsWith('IfcWall'))));
    assert.ok(hatches.length > 0);
    for (const h of hatches) assert.deepEqual([h.pattern, h.scale, h.pen], [engine.hatch, engine.hatchScale, engine.hatchPen]);
  });

  it('a project saved before the table had rows, or without the key, opens with no rows and the sheets draw as before', () => {
    const doc = projectDocument();
    const { materials: _none, ...withoutKey } = doc;
    for (const text of [JSON.stringify({ format: 'ifclite-project', version: 1, ...withoutKey }), serializeProject({ ...doc, materials: [] })]) {
      loadProjectDocument(parseProjectFile(text), { dirty: false });
      assert.deepEqual(useProjectStore.getState().materials ?? [], []);
      assert.ok(engineSays(text).every((r) => r.auto), 'the engine guesses every material');
    }
    mountAll();
    assert.deepEqual(wallHatches(), []);
  });
});
