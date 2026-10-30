/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The paper and the scale of every sheet are the same in the app and in `ifcsheet build` (#618). The app is run the way
 * the Wall runs it: the extent is measured when the geometry is in (`setExtent` with the project's level list not read
 * from the model yet, as the Wall's settled snapshot has it), the set is laid out by `startDrawingSet` once the levels
 * are in. The engine is the real `openModel` and `generateDefaultSet`. Before the fix the app measured the building as
 * the box of everything (site and ground around it) in that window: FZK-Haus came out on A2 and IfcOpenHouse at 1:100.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateDefaultSet } from '@bimvoice/ifcsheet';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, OPEN_HOUSE, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { wallExtent } from './wall-extent';
import { useViewerStore } from '@/store';
import { startDrawingSet } from './drawing-set-actions';
import { modelLevels } from './model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import type { ProjectSheet } from './types';

/** A sheet as the table of #618 reads it: number, paper and each viewport's scale. */
const rowsOf = (sheets: readonly ProjectSheet[]) => sheets.map((s) => [s.number, s.paper, ...(s.viewports ?? []).map((vp) => vp.scale)].join(' '));

/**
 * `models` with the box of everything their meshes hold (the site and the ground around the building included) as
 * the model's bounds, which is what `mergedSectionBounds` reads in the app once the whole geometry is in.
 */
function withBoxOfAll(models: ReturnType<typeof useViewerStore.getState>['models']): ReturnType<typeof useViewerStore.getState>['models'] {
  return new Map([...models].map(([id, model]) => {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const m of model.geometryResult?.meshes ?? []) {
      for (let i = 0; i + 2 < m.positions.length; i += 3) {
        for (const [axis, at] of [['x', 0], ['y', 1], ['z', 2]] as const) {
          min[axis] = Math.min(min[axis], m.positions[i + at]);
          max[axis] = Math.max(max[axis], m.positions[i + at]);
        }
      }
    }
    const geometryResult = model.geometryResult && { ...model.geometryResult, coordinateInfo: { ...model.geometryResult.coordinateInfo, shiftedBounds: { min, max } } };
    return [id, { ...model, geometryResult }];
  }));
}

const MODELS = [
  { name: 'AC20-FZK-Haus', path: FZK_HAUS, rows: ['A-101 A3 100 100', 'A-201 A3 100 100', 'A-202 A3 100 100', 'A-301 A3 100 100'] },
  { name: 'IfcOpenHouse_IFC4', path: OPEN_HOUSE, rows: ['A-101 A3 50', 'A-201 A3 100 100', 'A-202 A3 50 50', 'A-301 A3 50'] },
] as const;

for (const { name, path, rows } of MODELS) {
  describe(`${name} has one paper and one scale per sheet, in the app and in the engine`, { skip: planModelMissing(path) }, () => {
    it('the Wall start and `ifcsheet build` agree on the building, the sheet numbers, the paper and the scales', async () => {
      await loadPlanModel(path);
      // The Wall's moment: the geometry is in, the project has not read the model's levels yet.
      resetProject();
      const { models, geometryResult: legacy } = useViewerStore.getState();
      const meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
      // The geometry can be in before the data store is: the Wall has no extent yet, and lays nothing out on the box of everything.
      const [[id, loaded]] = [...models.entries()];
      useViewerStore.setState({ models: new Map([[id, { ...loaded, ifcDataStore: null, loadState: 'hydrating-metadata' }]]) } as never);
      assert.equal(wallExtent({ levels: [], meshes, models: useViewerStore.getState().models, legacy }), null, 'no extent without the data store');
      useViewerStore.setState({ models } as never);
      // The data store is in, the level list not read from the model yet (the Wall's settled snapshot).
      const extent = wallExtent({ levels: [], meshes, models: withBoxOfAll(models), legacy });
      assert.ok(extent, 'the app measures the building');
      syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
      assert.ok(startDrawingSet(meshes, extent), 'the Wall lays out a set');

      const model = await openModel(new Uint8Array(readFileSync(path)));
      assert.ok(model.extent, 'the engine measures the building');
      for (const end of ['min', 'max'] as const) {
        for (const axis of ['x', 'y', 'z'] as const) {
          assert.ok(Math.abs(extent[end][axis] - model.extent[end][axis]) < 1e-6, `${end}.${axis}: app ${extent[end][axis]}, engine ${model.extent[end][axis]}`);
        }
      }
      const made = generateDefaultSet(model);
      assert.ok(made, 'the engine lays out a set');
      const engineRows = rowsOf(made.document.sheets);
      assert.deepEqual(engineRows, [...rows]);
      assert.deepEqual(rowsOf(useProjectStore.getState().sheets), engineRows);
    });
  });
}
