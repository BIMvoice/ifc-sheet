/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Switching a plan between "Square to the building" and "True north" on `rotated-site.ifc` (site turned 48 degrees, so a
 * new plan is turned -42): the drafts of the plan turn with it, so a line drafted on the turned plan stays where it is
 * in the model (`drawingToWorld` before and after), and Undo takes the switch and the turning back as one step.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { GeometryResult } from '@ifc-lite/geometry';
import { drawingToWorld, generateDefaultSet } from '@bimvoice/ifcsheet';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { clearDraftHistory, commitDrafts, draftsOfView, newDraft, undoDrafts } from '@/drafting/draft-store';
import { meshFile } from '@/test/view-drawing-harness';
import { useProjectStore } from './project-store';
import { setPlanOrientation } from './plan-orientation-switch';
import { viewWorkPlane } from './view-plane-config';
import type { PlanProjectView, ProjectLevel } from './types';

const ROTATED = new URL('../../../../packages/ifcsheet/src/__fixtures__/rotated-site.ifc', import.meta.url);

describe('switching a plan between square to the building and true north (rotated-site.ifc)', () => {
  let geometry: GeometryResult | null = null;
  let levels: readonly ProjectLevel[] = [];
  let plan: PlanProjectView;
  before(async () => {
    geometry = await meshFile(ROTATED);
    if (!geometry) return;
    const set = generateDefaultSet(await openModel(new Uint8Array(readFileSync(ROTATED))));
    assert.ok(set, 'a default set');
    levels = set.levels;
    plan = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && !v.site)!;
  });
  beforeEach(() => {
    if (!geometry) return;
    publishDrawingRuntime({ geometryResult: geometry, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    useProjectStore.setState({ views: [plan], levels: [...levels], drafts: [], dirty: false });
    clearDraftHistory();
  });

  const current = () => useProjectStore.getState().views.find((v) => v.id === plan.id) as PlanProjectView;
  const world = (p: { x: number; y: number }) => {
    const work = viewWorkPlane(current(), null, levels);
    assert.ok(work, 'the plan has a work plane');
    return drawingToWorld(work, p);
  };

  it('keeps a line drafted on the turned plan where it is in the model, and Undo takes both back', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    assert.equal(plan.orientation, 'building');
    const a = { x: 1.25, y: -0.75 }, b = { x: 3, y: 0.5 };
    const line = newDraft(plan.id, '0', { type: 'line', a, b });
    commitDrafts([line]);
    const before = [world(a), world(b)];

    assert.equal(setPlanOrientation(plan.id, 'true-north'), true);
    assert.equal(current().orientation, 'true-north');
    const moved = draftsOfView(plan.id)[0].shape;
    assert.equal(moved.type, 'line');
    const now = moved.type === 'line' ? [world(moved.a), world(moved.b)] : [];
    assert.notDeepEqual(moved, line.shape, 'the line was turned in drawing metres');
    for (const [i, w] of now.entries()) {
      assert.ok(Math.hypot(w.x - before[i].x, w.y - before[i].y, w.z - before[i].z) < 1e-9, `end ${i} moved in the model`);
    }

    assert.equal(undoDrafts(), true, 'one step to undo');
    assert.equal(current().orientation, 'building');
    assert.deepEqual(draftsOfView(plan.id)[0].shape, line.shape);
    publishDrawingRuntime(null);
  });

  it('switches back to the building and the line is where it was in the model again', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const a = { x: -2, y: 1 }, b = { x: 0.5, y: 2.5 };
    commitDrafts([newDraft(plan.id, '0', { type: 'line', a, b })]);
    const before = [world(a), world(b)];
    setPlanOrientation(plan.id, 'true-north');
    setPlanOrientation(plan.id, 'building');
    const shape = draftsOfView(plan.id)[0].shape;
    assert.equal(shape.type, 'line');
    const now = shape.type === 'line' ? [world(shape.a), world(shape.b)] : [];
    for (const [i, w] of now.entries()) assert.ok(Math.hypot(w.x - before[i].x, w.z - before[i].z) < 1e-9, `end ${i} moved in the model`);
    publishDrawingRuntime(null);
  });

  it('refuses while no model is open, so nothing is switched without its drafts', (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    publishDrawingRuntime(null);
    assert.equal(setPlanOrientation(plan.id, 'true-north'), false);
    assert.equal(current().orientation, 'building');
  });
});
