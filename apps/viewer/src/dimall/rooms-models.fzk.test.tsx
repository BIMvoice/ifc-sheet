/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Room dimensions on real models (#638). The FZK-Haus' ground floor against the clear sizes IfcOpenShell reads off the IFC
 * (each IfcSpace's neighbouring wall faces, measured in Blender's Python): Schlafzimmer 4.05 x 5.45, Bad 3.37 x 3.71, Buero
 * 3.50 x 3.71, Flur 1.50 deep (the space itself is 1.74 deep, with its door niches), Kueche and Wohnen 3.71 deep and, being
 * one open space with no wall between them, no width. (Run in the app, where the plan's own dashed door lines are known, the
 * hall's 7.11 is left out as well: they run along both of its faces. This test gives the planner no linework.) The IfcOpenHouse has no IfcSpace: no chains, and it says so.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import type { GeometryResult } from '@ifc-lite/geometry';
import { dimensionLayout } from '@/drafting/annotation';
import { FZK_HAUS, OPEN_HOUSE, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { defaultPlanCutHeight } from '@/project/view-defaults';
import type { ProjectView } from '@/project/types';
import { roomsOfPlan } from '@/tagall/rooms';
import { planParts } from './parts';
import { planRoomChains, type RoomPlan } from './rooms';

const missing = planModelMissing(FZK_HAUS) || planModelMissing(OPEN_HOUSE);

async function roomsOn(path: string, name: string): Promise<{ plan: RoomPlan; model: LoadedPlanModel }> {
  const model = await loadPlanModel(path);
  const geometry = (await meshFile(pathToFileURL(path) as URL)) as GeometryResult;
  assert.ok(geometry);
  const level = model.levels.find((l) => l.name === name);
  assert.ok(level, name);
  const view = { id: 'v', name, kind: 'plan', createdAt: 0, level, cutHeight: defaultPlanCutHeight(level, model.levels), scale: 100 } as unknown as Exclude<ProjectView, { kind: '3d' }>;
  const drawing = await viewDrawing(view, geometry);
  assert.ok(drawing);
  const rooms = roomsOfPlan(view, model.levels, geometry).map((r) => ({ id: r.guid, ring: r.ring }));
  return { plan: planRoomChains(planParts(drawing, geometry.meshes), rooms, { textHeight: 0.25, obstacles: [] }), model };
}

describe('room dimensions on real models', { skip: missing }, () => {
  let fzk: RoomPlan;
  before(async () => {
    fzk = (await roomsOn(FZK_HAUS, 'Erdgeschoss')).plan;
  });

  it('prints the FZK-Haus rooms at the clear sizes the IFC walls have', () => {
    const labels = fzk.shapes.map((s) => dimensionLayout(s).label).sort();
    // IfcOpenShell: 4.05, 5.45 | 3.37, 3.71 | 3.50, 3.71 | 1.50, 7.11 | 3.71 | 3.71.
    assert.deepEqual(labels, ['1.50', '3.37', '3.50', '3.71', '3.71', '3.71', '3.71', '4.05', '5.45', '7.11']);
  });

  it('counts what it leaves out: the open living space has no width', () => {
    assert.equal(fzk.dropped, 2);
    assert.equal(fzk.noRooms, false);
  });

  it('draws nothing and says so on a model with no IfcSpace', async () => {
    const { plan } = await roomsOn(OPEN_HOUSE, OPEN_HOUSE_LEVEL);
    assert.deepEqual([plan.chains.length, plan.dropped, plan.noRooms], [0, 0, true]);
  });
});

const OPEN_HOUSE_LEVEL = 'Storey #38';
