/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The FZK-Haus through the drawing the app makes, against figures read off the IFC with another reader (IfcOpenShell,
 * each wall and each opening along the wall's own axis). Its round first-floor windows are 1.00 wide and cut at 0.96 by
 * the plan; its walls meet at mitres; and its wall types carry templates that must not reach a plan.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import type { GeometryResult } from '@ifc-lite/geometry';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { defaultPlanCutHeight } from '@/project/view-defaults';
import type { ProjectView } from '@/project/types';
import { planParts } from './parts';
import { planDimensions } from './plan';
import type { DimensionPlan, PlannedString } from './types';

const MM = 0.001;
const missing = planModelMissing(FZK_HAUS);
const spans = (s: PlannedString) => s.points.slice(1).map((b, i) => Math.hypot(b.x - s.points[i].x, b.y - s.points[i].y));

describe('DIMALL on the FZK-Haus (#632)', { skip: missing }, () => {
  let model: LoadedPlanModel;
  let geometry: GeometryResult;
  const planOf = async (name: string): Promise<DimensionPlan> => {
    const level = model.levels.find((l) => l.name === name);
    assert.ok(level, name);
    const view = { id: 'v', name, kind: 'plan', createdAt: 0, level, cutHeight: defaultPlanCutHeight(level, model.levels), scale: 100 } as unknown as Exclude<ProjectView, { kind: '3d' }>;
    const drawing = await viewDrawing(view, geometry);
    assert.ok(drawing);
    return planDimensions(planParts(drawing, geometry.meshes), { paperUnit: 0.1, textHeight: 0.25 });
  };
  const widthOf = (plan: DimensionPlan, name: string): number[] => plan.strings.flatMap((s) => spans(s).filter((_, k) => s.measures[k] === model.idsByName.get(name)));

  before(async () => {
    model = await loadPlanModel(FZK_HAUS);
    const meshed = await meshFile(pathToFileURL(FZK_HAUS) as URL);
    assert.ok(meshed);
    geometry = meshed;
  });

  it('reads 12.00 and 10.00 round the ground floor, on every side', async () => {
    const plan = await planOf('Erdgeschoss');
    const overall = plan.strings.filter((s) => s.kind === 'overall').map((s) => spans(s)[0]).sort((a, b) => a - b);
    assert.equal(overall.length, 4);
    [10, 10, 12, 12].forEach((want, i) => assert.ok(Math.abs(overall[i] - want) <= MM, overall.join()));
  });

  it('reads each opening of the ground floor at the width the model has', async () => {
    const plan = await planOf('Erdgeschoss');
    for (const [name, want] of [['EG-Fenster-1', 2], ['EG-Fenster-4', 2], ['EG-Fenster-8', 2], ['Haustuer', 1.01], ['Terrassentuer', 2.01]] as const) {
      const got = widthOf(plan, name);
      assert.ok(got.length > 0 && got.every((v) => Math.abs(v - want) <= MM), `${name}: ${got.join()} against ${want}`);
    }
  });

  it('reads the round windows upstairs at 1.00, not at what the cut leaves of them', async () => {
    const plan = await planOf('Dachgeschoss');
    for (const name of ['OG-Fenster-1', 'OG-Fenster-2']) {
      const got = widthOf(plan, name);
      assert.ok(got.length > 0 && got.every((v) => Math.abs(v - 1) <= MM), `${name}: ${got.join()}`);
    }
    const overall = plan.strings.filter((s) => s.kind === 'overall').map((s) => spans(s)[0]);
    assert.ok(overall.length === 2 && overall.every((v) => Math.abs(v - 7.5751) <= MM), overall.join());
  });
});
