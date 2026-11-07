/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The structural grid of ISSUE_021 Mini Project (7 grids, 63 axes) is the same in the app and in the engine's headless run (#707): the
 * axes in the render frame (the app through the storey workplane, the engine through `gridAxesOfModel`) agree to 1e-6, and the boxes a
 * plan's tags and dimensions keep clear of (`overlayObstacleBoxes(gridOverlays(...))` in the app) are the ones the engine uses.
 * The fixture is fetched by `pnpm fixtures`; without it the test skips.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateDefaultSet, gridAxesOfModel, overlayObstacleBoxes, gridObstacles, gridShapesOf, type DefaultSet } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, sectionConfigFor, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { gridOverlays, viewGridAxes } from './grid-overlay';

const MINI = fileURLToPath(new URL('../../../../tests/models/ara3d/ISSUE_021_Mini Project.ifc', import.meta.url));

describe('the grid of Mini Project is the same in the app and in the headless run (#707)', { skip: planModelMissing(MINI) }, () => {
  let engine: OpenedModel;
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;

  before(async () => {
    await loadPlanModel(MINI);
    engine = await openModel(new Uint8Array(readFileSync(MINI)));
    set = generateDefaultSet(engine)!;
    assert.ok(set && engine.extent, 'the engine lays out a set');
    drawings = await generateViewDrawings(set.document.views, engine.buildingMeshes, set.levels, engine.extent!);
  });

  it('the axes agree to 1e-6 in the render frame', () => {
    const plans = set.document.views.filter((v) => v.kind === 'plan');
    let counted = 0;
    for (const view of plans) {
      if (view.kind !== 'plan') continue;
      const app = viewGridAxes(view);
      const eng = gridAxesOfModel(engine.dataStore!, engine.coordinateInfo, view.level.storeyGlobalIds);
      assert.equal(eng.length, app.length, `${view.name}: axis count`);
      for (const a of app) {
        const e = eng.find((x) => x.key === a.key);
        assert.ok(e, `${view.name}: the engine has axis ${a.key}`);
        assert.equal(e.tag, a.tag);
        for (const end of ['a', 'b'] as const) for (let i = 0; i < 3; i++) assert.ok(Math.abs(e[end][i]! - a[end][i]!) < 1e-6, `${view.name}: ${a.key} ${end}[${i}] ${e[end][i]} vs ${a[end][i]}`);
      }
      counted += app.length;
    }
    assert.ok(counted >= 63, `the plans have the grid axes (${counted})`);
  });

  it('the boxes of the grid a plan keeps clear of are the same in the app and the engine', () => {
    const key = (b: { x0: number; y0: number; x1: number; y1: number; dashed?: boolean }) => [b.x0, b.y0, b.x1, b.y1].map((n) => Math.round(n * 1e3) / 1e3).join(',') + (b.dashed ? 'd' : '');
    let boxes = 0;
    for (const view of set.document.views) {
      if (view.kind !== 'plan') continue;
      const drawing = drawings.get(view.id);
      if (!drawing) continue;
      const plane = sectionConfigFor(view, set.levels, engine.extent!)!.plane;
      const scale = view.scale && view.scale > 0 ? view.scale : 100;
      const app = overlayObstacleBoxes(gridOverlays(view, plane, drawing));
      const axes = gridAxesOfModel(engine.dataStore!, engine.coordinateInfo, view.level.storeyGlobalIds);
      const eng = gridObstacles(gridShapesOf(axes, 'plan', plane, 'both', scale / 1000, drawing.bounds));
      assert.equal(eng.length, app.length, `${view.name}: box count, engine vs app`);
      assert.deepEqual(eng.map(key).sort(), app.map(key).sort(), `${view.name}: boxes to a millimetre`);
      boxes += app.length;
    }
    assert.ok(boxes > 0, 'the plans have grid boxes');
  });
});
