/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotating the set headlessly hands DIMALL and TAGALL the grid of the plan as obstacles (#707): the bubbles and axis lines of an IfcGrid,
 * as the app's `gridOverlays` draws them. Read at the readers, what each command is given, on ISSUE_021 Mini Project (7 grids, 63 axes;
 * `pnpm fixtures`). The app's boxes are compared in apps/viewer `project/grid-parity.models.test.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDefaultSet } from '../default-set.js';
import { generateViewDrawings, openModel } from '../headless.js';
import { gridAxesOfModel, gridObstacles, gridShapesOf } from '../grid-overlay.js';
import { readersOf } from './headless.js';

const MINI = fileURLToPath(new URL('../../../../tests/models/ara3d/ISSUE_021_Mini Project.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(MINI) ? 'ISSUE_021_Mini Project.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the headless grid obstacle test: ${missing}`);

describe.skipIf(missing !== null)('annotateSetHeadless keeps labels off the grid of Mini Project (#707)', () => {
  it('hands DIMALL and TAGALL the grid bubbles and axis lines of each plan as obstacles', async () => {
    const model = await openModel(new Uint8Array(readFileSync(MINI)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set) throw new Error('no set: the model has no extent');
    const readers = readersOf(model, set, [], undefined);
    const plans = set.document.views.filter((v) => v.kind === 'plan');
    const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent!);
    let counted = 0;
    for (const view of plans) {
      const drawing = drawings.get(view.id);
      if (!drawing || view.kind !== 'plan') continue;
      const call = { view: { id: view.id, name: view.name, kind: view.kind, scale: view.scale }, drawing, placed: [], newId: () => 'x', locale: 'en' as const };
      const axes = gridAxesOfModel(model.dataStore!, model.coordinateInfo, view.level.storeyGlobalIds);
      const grid = gridObstacles(gridShapesOf(axes, 'plan', drawing.config.plane, 'both', (view.scale && view.scale > 0 ? view.scale : 100) / 1000, drawing.bounds));
      counted += grid.length;
      expect(readers.dimall(call)?.obstacles, `${view.name}: DIMALL obstacles`).toEqual(expect.arrayContaining(grid));
      expect(readers.tagall(call)?.obstacles, `${view.name}: TAGALL obstacles`).toEqual(expect.arrayContaining(grid));
    }
    expect(counted, 'the plans have grid boxes').toBeGreaterThan(0);
  }, 300_000);
});
