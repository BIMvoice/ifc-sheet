/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A material's Fill paints an elevation the same on the app's sheet and in the engine's headless sheets (#633). AC20-FZK-Haus is loaded
 * into the app's stores (`withSurfaceFills`, which names a mesh's material through the loaded model) and opened by the engine
 * (`sheetGraphics`, which names it through `headlessMaterialOf`); both draw the four elevations of the generated set with the same
 * materials table. The rows are the four elevations. Each side's faces are compared as runs of one colour in painter's order (the engine
 * clips them to the viewport, so a face count is not comparable, but the colours and their order are). A comparison with no coloured
 * face is no comparison, so each row first asserts that its faces hold the colour the table gave.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from '@bimvoice/ifcsheet';
import { meshMaterialName } from '@bimvoice/ifcsheet/material-colour';
import { IFC_FILL, type ProjectMaterial } from '@bimvoice/ifcsheet/materials';
import { generateViewDrawings, openModel, sheetGraphics, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { resetProject } from './project-store';
import { styledDrawing } from './view-graphics';
import { withSurfaceFills } from './view-surface-fills';
import type { ProjectView } from './types';

/** Runs of one colour, in order: `[red, red, blue, red]` is `[red, blue, red]`. */
const runs = (colours: readonly string[]): string[] => colours.filter((c, i) => c !== colours[i - 1]);

describe('the elevations of AC20-FZK-Haus take a material colour the same in the app and the engine', { skip: planModelMissing(FZK_HAUS) }, () => {
  let engine: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;
  let table: ProjectMaterial[];
  let layerNames: string[];

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    engine = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    set = generateDefaultSet(engine)!;
    assert.ok(set && engine.extent, 'the engine lays out a set');
    drawings = await generateViewDrawings(set.document.views, engine.buildingMeshes, set.levels, engine.extent!);
    layerNames = [...new Set(engine.buildingMeshes.map((m) => meshMaterialName(engine.dataStore!, m.expressId, m.materialId)).filter((n): n is string => !!n))].sort();
    assert.ok(layerNames.length >= 1, 'the model has layer materials to colour');
    table = layerNames.map((name, i): ProjectMaterial => ({ id: name, name, fill: i === 0 ? IFC_FILL : i === 1 ? '#00ff00' : null }));
  });
  beforeEach(() => resetProject());

  const elevations = () => set.document.views.filter((v) => v.kind === 'elevation');
  const appMeshes = () => [...useViewerStore.getState().models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
  const app = (view: ProjectView, materials: ProjectMaterial[]): string[] => {
    const drawing = withSurfaceFills(styledDrawing(drawings.get(view.id)!, view.graphics), view, view.graphics, appMeshes(), new Set(), materials) as { surfaceFills?: { surfaceColour: string }[] };
    return (drawing.surfaceFills ?? []).map((f) => f.surfaceColour);
  };
  /** The surface fills of each sheet that hangs an elevation, in viewport order: the engine's sheet, and the app's views on it. */
  const rows = async (materials: ProjectMaterial[]) => {
    const sheets = await sheetGraphics(set, engine, { materials });
    return sheets.filter((s) => s.viewports.some((vp) => elevations().some((v) => v.id === vp.viewId))).map((s) => ({
      sheet: s.name ?? s.number,
      eng: s.fills.filter((f) => f.surface).map((f) => f.colour),
      app: s.viewports.flatMap((vp) => { const v = elevations().find((e) => e.id === vp.viewId); return v ? app(v, materials) : []; }),
    }));
  };

  it('has four elevations to compare', () => assert.equal(elevations().length, 4));

  it('paints every elevation sheet in the same colours in the same order, and a table that sets no colour paints none', async () => {
    const painted = await rows(table);
    assert.ok(painted.length >= 2, 'two sheets of elevations');
    for (const r of painted) {
      assert.deepEqual(runs(r.eng), runs(r.app), `${r.sheet}: the colours in painter's order, engine vs app`);
      assert.ok(r.app.length > 0, `${r.sheet}: the app draws faces`);
      assert.ok(r.app.includes('#00ff00') && r.app.includes('#ffffff'), `${r.sheet}: the table's own colour and paper white are both drawn`);
    }
    for (const r of await rows([])) {
      assert.deepEqual(r.app, [], `${r.sheet}: no colour set, none drawn (app)`);
      assert.deepEqual(r.eng, [], `${r.sheet}: no colour set, none drawn (engine)`);
    }
  });
});
