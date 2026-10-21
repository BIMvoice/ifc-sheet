/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The headless engine makes the set the Wall makes (#163). AC20-FZK-Haus goes
 * through the app's own start, as when the model opens on an empty project
 * (`syncProjectWithModels`, then `startDrawingSet` over `setExtent`), and
 * through `@bimvoice/ifcsheet`'s `openModel` and `generateDefaultSet`, which
 * read the same file without the app's stores. The two must lay out the same
 * sheets, numbered alike, holding the same views at the same scales and
 * places, and the same views with the same planes and depths.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateDefaultSet, type DefaultSet, type ModelExtent } from '@bimvoice/ifcsheet';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { setExtent } from '@/draft-set/body';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { startDrawingSet } from './drawing-set-actions';
import { modelLevels } from './model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import type { ProjectSheet, ProjectView } from './types';

const near = (a: number | null | undefined, b: number | null | undefined, what: string): void => {
  assert.ok(a != null && b != null && Math.abs(a - b) < 1e-6, `${what}: app ${a}, engine ${b}`);
};

/** A sheet as compared: what it is, and each viewport as its view's name, scale and place. */
function sheetRows(sheets: readonly ProjectSheet[], views: readonly ProjectView[]) {
  return sheets.map((s) => ({
    number: s.number, name: s.name, series: s.series, paper: s.paper, orientation: s.orientation,
    viewports: (s.viewports ?? []).map((vp) => ({ view: views.find((v) => v.id === vp.viewId)?.name, scale: vp.scale, x: vp.x.toFixed(6), y: vp.y.toFixed(6) })),
  }));
}

const byName = (views: readonly ProjectView[]) => new Map(views.map((v) => [`${v.kind} ${v.name}`, v]));

describe('the engine and the Wall lay out the same set of AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let app: { views: ProjectView[]; sheets: ProjectSheet[]; extent: ModelExtent };
  let engine: DefaultSet;
  let engineExtent: ModelExtent | null;

  before(async () => {
    await loadPlanModel(FZK_HAUS);
    // What the app does when the model opens on an empty project, then what the Wall does once the geometry is in.
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const { models, geometryResult } = useViewerStore.getState();
    const meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    assert.ok(extent, 'the app measures the building');
    assert.ok(startDrawingSet(meshes, extent), 'the Wall lays out a set');
    const { views, sheets } = useProjectStore.getState();
    app = { views, sheets, extent };

    const model = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    engineExtent = model.extent;
    const made = generateDefaultSet(model);
    assert.ok(made, 'the engine lays out a set');
    engine = made;
  });

  it('measures the same building', () => {
    assert.ok(engineExtent);
    for (const end of ['min', 'max'] as const) for (const axis of ['x', 'y', 'z'] as const) near(app.extent[end][axis], engineExtent[end][axis], `${end}.${axis}`);
  });

  it('makes the same sheets, numbered alike, with the same views at the same scales and places', () => {
    assert.deepEqual(sheetRows(engine.document.sheets, engine.document.views), sheetRows(app.sheets, app.views));
    assert.deepEqual(engine.document.sheets.map((s) => s.number), ['A-101', 'A-201', 'A-202', 'A-301']);
  });

  it('makes the same views, with the same planes, depths and scales', () => {
    const mine = byName(engine.document.views);
    const theirs = byName(app.views);
    assert.deepEqual([...mine.keys()].sort(), [...theirs.keys()].sort());
    for (const [key, a] of theirs) {
      const b = mine.get(key);
      assert.ok(b && b.kind === a.kind, key);
      assert.equal(b.scale, a.scale, `${key} scale`);
      assert.equal(b.viewDepth, a.viewDepth, `${key} depth`);
      if (a.kind === 'elevation' && b.kind === 'elevation') near(a.planeOffset, b.planeOffset, `${key} plane`);
      if (a.kind === 'plan' && b.kind === 'plan') assert.deepEqual({ ...b.level }, { name: a.level.name, elevation: a.level.elevation, storeyGlobalIds: a.level.storeyGlobalIds }, `${key} level`);
      if (a.kind === 'section' && b.kind === 'section') {
        assert.equal(b.through, a.through, `${key} through`);
        near(a.plane.custom?.distance, b.plane.custom?.distance, `${key} distance`);
        a.plane.custom?.normal.forEach((n, i) => near(n, b.plane.custom?.normal[i], `${key} normal[${i}]`));
      }
    }
  });
});
