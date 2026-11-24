/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project drawer sets which way the opening lines of doors and windows point in elevation (#870), on AC20-FZK-Haus: the inner
 * door "Innentuer-2" states SINGLE_SWING_LEFT, a section through its wall draws its opening triangle, and the ground floor plan draws
 * its swing arc about the hinge. With the drawer's "handle" (a new project's) the triangle's apex is across the leaf from that hinge
 * and its base on it; with "hinge" the apex is on it. The app draws it from the project store, the engine from the project file the
 * app saves (what `ifcsheet build` reads), and both draw the same lines.
 */

import '@/test/setup-dom.js';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { generateDefaultSet, viewOpeningSymbols as engineSymbols, visibleEntities, type OpeningSymbol } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, sectionConfigFor, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { readProjectFile } from '@bimvoice/ifcsheet/project';
import { drawingToWorld, worldToDrawing } from '@bimvoice/ifcsheet/world-frame';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { serializeProject } from '@/project/project-file';
import { viewElevationSymbols, viewOpeningSymbols as appPlanSymbols } from '@/project/view-symbols';
import { invalidateJoineryReads } from '@/joinery/element-spec';
import { DEFAULT_JOINERY_MAPPING } from '@/joinery/symbol-mapping';
import type { DraftShape, Pt } from '@/drafting/types';
import { useViewDrawings } from '@/project/view-drawings';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { useSheetContent, type SheetContent } from '../../sheets/useSheetContent';
import { openingLinesSection } from './opening-lines';

const DOOR = 'Innentuer-2';
const EXTENT = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };

const mount = () => {
  const Section = openingLinesSection.component;
  return render(<Section go={() => undefined} onClose={() => undefined} extent={EXTENT} />);
};
const select = (ui: HTMLElement) => {
  const s = ui.querySelector('select[data-opening-lines]') as HTMLSelectElement | null;
  assert.ok(s, 'the drawer has the opening-lines choice');
  return s;
};
const choose = (ui: HTMLElement, value: string) => act(() => {
  const s = select(ui);
  s.value = value;
  s.dispatchEvent(new window.Event('change', { bubbles: true }));
});

/** The door's opening triangle: the three-point polyline; its apex is the point off the side the other two share. */
function triangle(s: OpeningSymbol): { apexX: number; baseX: number } {
  const tris = [...s.shapes, ...(s.dashed ?? [])].filter((x): x is Extract<DraftShape, { type: 'polyline' }> => x.type === 'polyline' && x.pts.length === 3);
  assert.equal(tris.length, 1, 'one opening triangle');
  const [p, apex, q] = tris[0].pts;
  assert.ok(Math.abs(p.x - q.x) < 1e-6, 'the base is a jamb');
  return { apexX: apex.x, baseX: p.x };
}

describe('the drawer sets the direction of the opening lines (#870) on AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let engine: OpenedModel;
  let door: number;
  let plane: SectionPlaneConfig;
  let drawing: Drawing2D;
  let view: ProjectView;
  /** The door's hinge, as the plan's swing arc places it, in the section's drawing x. */
  let hingeX: number;
  /** The section's x of the door's two jambs. */
  let jambs: [number, number];

  const appMeshes = (): MeshData[] => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const doorOf = (list: readonly OpeningSymbol[]) => {
    const s = list.find((x) => x.id === door);
    assert.ok(s, 'the section draws the door\'s opening lines');
    return s;
  };
  const app = () => doorOf(viewElevationSymbols(appMeshes(), plane, visibleEntities(drawing), new Set(), useProjectStore.getState().symbolFlips, 'fine'));
  /** The engine, reading the project file the app saves. */
  const eng = () => {
    const facts = readProjectFile(serializeProject(projectDocument()));
    return doorOf(engineSymbols(engine.buildingMeshes, plane, drawing, { live: { dataStore: engine.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING, openingLines: facts.openingLines } }, undefined));
  };

  before(async () => {
    const loaded = await loadPlanModel(FZK_HAUS);
    engine = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    const set = generateDefaultSet(engine);
    assert.ok(set && engine.extent, 'the engine lays out a set');
    const id = loaded.idsByName.get(DOOR);
    assert.ok(id !== undefined, `${DOOR} is in the model`);
    door = id;
    // The door's box in the world (a mesh's positions are about its origin): the thin side is across its wall, so the section cuts along it.
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const m of engine.buildingMeshes.filter((x) => x.expressId === door)) {
      const [ox, oy, oz] = m.origin ?? [0, 0, 0];
      for (let i = 0; i < m.positions.length; i += 3) {
        const p = { x: ox + m.positions[i], y: oy + m.positions[i + 1], z: oz + m.positions[i + 2] };
        for (const k of ['x', 'y', 'z'] as const) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
    }
    const acrossZ = max.z - min.z < max.x - min.x;
    view = { id: 's', kind: 'section', name: 'Through the door', plane: { axis: acrossZ ? 'front' : 'side', offset: acrossZ ? (min.z + max.z) / 2 : (min.x + max.x) / 2, flipped: false }, createdAt: 0 } as ProjectView;
    plane = sectionConfigFor(view, set.levels, engine.extent)!.plane;
    drawing = (await generateViewDrawings([view], engine.buildingMeshes, set.levels, engine.extent)).get('s')!;
    assert.ok(drawing && visibleEntities(drawing).has(door), 'the section shows the door');
    const a = worldToDrawing(plane, min).x, b = worldToDrawing(plane, max).x;
    jambs = [Math.min(a, b), Math.max(a, b)];
    // The plan a metre above the door's foot: its swing arc turns about the hinge.
    const planPlane: SectionPlaneConfig = { axis: 'y', position: min.y + 1, flipped: false };
    const swing = appPlanSymbols(appMeshes(), planPlane, undefined, new Set()).find((s) => s.id === door);
    const arc = [...(swing?.shapes ?? []), ...(swing?.heavy ?? [])].find((s): s is Extract<DraftShape, { type: 'arc' }> => s.type === 'arc');
    assert.ok(arc, 'the plan draws the door\'s swing arc');
    hingeX = worldToDrawing(plane, drawingToWorld(planPlane, arc.c as Pt)).x;
    assert.ok(Math.min(Math.abs(hingeX - jambs[0]), Math.abs(hingeX - jambs[1])) < 0.15, `the hinge (${hingeX}) is at a jamb (${jambs})`);
  });
  beforeEach(() => { resetProject(); invalidateJoineryReads(); });
  afterEach(() => { cleanup(); useViewDrawings.setState({ byView: {} }); publishDrawingRuntime(null); });

  /** The jamb nearest `x`. */
  const jambAt = (x: number) => (Math.abs(x - jambs[0]) < Math.abs(x - jambs[1]) ? 0 : 1);

  it('a new project draws to the handle, as before: the drawer shows it and the lines are those of no setting', () => {
    const before = app();
    const ui = mount();
    assert.equal(select(ui).value, 'handle');
    assert.equal(useProjectStore.getState().openingLines, undefined, 'showing the choice writes nothing');
    choose(ui, 'handle');
    assert.deepEqual(app(), before, 'the default is the drawing a project without the setting makes');
    const { apexX, baseX } = triangle(before);
    assert.notEqual(jambAt(apexX), jambAt(hingeX), 'the apex is at the handle');
    assert.equal(jambAt(baseX), jambAt(hingeX), 'the base is on the hinges');
  });

  it('"hinge" puts the apex of the same door on its hinges, in the app and in the engine reading the saved project', () => {
    const ui = mount();
    const handle = { app: triangle(app()), engine: triangle(eng()) };
    choose(ui, 'hinge');
    assert.equal(useProjectStore.getState().openingLines, 'hinge');
    const hinge = { app: triangle(app()), engine: triangle(eng()) };
    for (const side of ['app', 'engine'] as const) {
      assert.notEqual(jambAt(handle[side].apexX), jambAt(hingeX), `${side}: handle, the apex across from the hinges`);
      assert.equal(jambAt(hinge[side].apexX), jambAt(hingeX), `${side}: hinge, the apex on the hinges`);
      assert.equal(jambAt(hinge[side].baseX), jambAt(handle[side].apexX), `${side}: hinge, the base at the handle`);
    }
    assert.deepEqual(eng(), app(), 'the engine draws what the app draws');
    choose(ui, 'handle');
    assert.notEqual(jambAt(triangle(app()).apexX), jambAt(hingeX), 'back to the handle');
  });

  it('a sheet that shows the section redraws the door\'s lines when the drawer changes them, without being opened again', () => {
    const vp: SheetViewport = { id: 'vp', viewId: view.id, x: 200, y: 150, scale: 50, width: 0, height: 0, center: null };
    const sheet: ProjectSheet = { id: 'sh', number: 'A-301', name: 'Sections', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] };
    useProjectStore.setState({ views: [view], sheets: [sheet], drafts: [] });
    useViewDrawings.setState({ byView: { [view.id]: { drawing, status: 'ready', progress: 100, phase: '', error: null } } });
    const geometryResult = [...useViewerStore.getState().models.values()][0].geometryResult;
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false });
    let hook: SheetContent | null = null;
    function Harness() {
      hook = useSheetContent(sheet);
      return null;
    }
    render(<Harness />);
    const ui = mount();
    /** The door's triangle among the sheet's symbol pens: the three-point polyline between its jambs. */
    const onSheet = () => {
      const shapes = (hook!.content(vp).overlays ?? []).filter((o) => o.layer === 'SYMBOLS').flatMap((o) => o.shapes);
      const tri = shapes.find((x): x is Extract<DraftShape, { type: 'polyline' }> => x.type === 'polyline' && x.pts.length === 3 && x.pts.every((p) => p.x > jambs[0] - 0.01 && p.x < jambs[1] + 0.01));
      assert.ok(tri, 'the sheet draws the door\'s opening lines');
      return tri.pts[1].x;
    };
    assert.notEqual(jambAt(onSheet()), jambAt(hingeX), 'the sheet draws to the handle');
    choose(ui, 'hinge');
    assert.equal(jambAt(onSheet()), jambAt(hingeX), 'the same sheet now draws the apex on the hinges');
  });
});
