/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #581: the app and the engine fill `ScheduleModel`, the one read every schedule takes of a model, from the same model the
 * same way. The app fills it from its stores (`loadedScheduleModels`) over AC20-FZK-Haus as the viewer loaded it; the engine
 * fills it from the model it opened (`scheduleModelsOf`, which `ifcsheet check --project` and `build` use). For every
 * element, the meshes (vertex count and world box) and the list provider's class, name and Qto sets must agree. The table
 * is not empty: FZK has meshes, Qto sets and classes, and each is asserted to have been compared.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MeshData } from '@ifc-lite/geometry';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { scheduleModelsOf, type ScheduleModel } from '@bimvoice/ifcsheet/project';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { loadedScheduleModels } from '@/joinery/schedule-models';
import { useViewerStore } from '@/store';

/** The vertices of `meshes` and the box they span, the per-element origin folded in. */
function shapeOf(meshes: readonly MeshData[] | undefined): { vertices: number; box: number[] } {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let vertices = 0;
  for (const m of meshes ?? []) {
    vertices += m.positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = m.positions[i + a] + (m.origin?.[a] ?? 0);
        box[a] = Math.min(box[a], v);
        box[a + 3] = Math.max(box[a + 3], v);
      }
    }
  }
  return { vertices, box: box.map((n) => Math.round(n * 1e4) / 1e4) };
}

describe('the app and the engine fill ScheduleModel alike, on AC20-FZK-Haus (#581)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let app: ScheduleModel;
  let engine: ScheduleModel;
  let ids: number[];
  before(async () => {
    await loadPlanModel(FZK_HAUS);
    [app] = loadedScheduleModels();
    const opened = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    [engine] = scheduleModelsOf(opened, 'm', 'm');
    ids = [...new Set((useViewerStore.getState().models.get('m')?.geometryResult?.meshes ?? []).map((m) => m.expressId))].sort((a, b) => a - b);
  });

  it('names the model and its entities the same', () => {
    assert.equal(loadedScheduleModels().length, 1);
    assert.equal(app.modelId, engine.modelId);
    assert.equal(app.name, engine.name);
    assert.ok(app.dataStore && engine.dataStore && app.view === null && engine.view === null);
    assert.deepEqual(app.listProvider!().getAllEntityIds!(), engine.listProvider!().getAllEntityIds!());
  });

  it('gives every element the same meshes (vertices and world box)', () => {
    assert.ok(ids.length > 50, 'the model has elements with geometry');
    let withVertices = 0;
    for (const id of ids) {
      const a = shapeOf(app.meshesOf!(id)), e = shapeOf(engine.meshesOf!(id));
      assert.deepEqual(a, e, `meshes of #${id}`);
      if (a.vertices > 0) withVertices++;
    }
    assert.ok(withVertices > 50, `the comparison saw ${withVertices} meshed elements`);
    assert.equal(shapeOf(app.meshesOf!(-1)).vertices, 0);
  });

  it('gives every element the same class, name and Qto sets', () => {
    const a = app.listProvider!(), e = engine.listProvider!();
    let withQto = 0;
    for (const id of a.getAllEntityIds!()) {
      assert.equal(a.getEntityTypeName(id), e.getEntityTypeName(id), `class of #${id}`);
      assert.equal(a.getEntityName(id), e.getEntityName(id), `name of #${id}`);
      const qa = a.getQuantitySets(id);
      assert.deepEqual(qa, e.getQuantitySets(id), `Qto sets of #${id}`);
      if (qa.length > 0) withQto++;
    }
    assert.ok(withQto > 10, `the comparison saw ${withQto} elements with Qto sets`);
  });
});
