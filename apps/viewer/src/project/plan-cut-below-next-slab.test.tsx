/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #232: the default plan cut stays below the next storey's floor build-up when
 * that storey is less than 1.2 m up. The rule is `defaultPlanCutHeight` in the
 * engine package; the viewer's plan makers (the project sync, the drawing-set
 * planner) must take their cut from it, and a cut a person set must win.
 *
 * The fixture (`__fixtures__/plan-cut-below-next-slab.ifc`): Lower at 0.0 m
 * holds four 0.85 m walls, 0.2 m thick, around an 8 x 6 m room; Upper at 1.0 m
 * holds one 8 x 6 m slab from 0.85 to 1.30 m (0.15 m below its storey, 0.30 m
 * above it). A plain floor + 1.2 m cut (1.2 m) runs through that slab and over
 * the walls; the rule's cut (0.5 m) runs through the walls and under the slab.
 */

import { beforeEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { boundsOf, meshFile, viewDrawing } from '@/test/view-drawing-harness';
import { ensureDrawingSet } from './drawing-set-actions.js';
import { removeProjectItem, resetProject, syncProjectWithModels, updateProjectView, useProjectStore } from './project-store.js';
import { ensureSitePlan } from '@/siteplan/site-actions';
import type { PlanProjectView } from './types';

const FIXTURE = new URL('./__fixtures__/plan-cut-below-next-slab.ifc', import.meta.url);
const STOREYS = [{ name: 'Lower', elevation: 0 }, { name: 'Upper', elevation: 1 }];
const WALL_FOOTPRINT_M2 = 8 * 6 - 7.6 * 5.6;
const SLAB_M2 = 8 * 6;

const state = () => useProjectStore.getState();
const planOf = (name: string): PlanProjectView => {
  const found = state().views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === name);
  if (!found) throw new Error(`no plan ${name}`);
  return found;
};

const area = (points: readonly { x: number; y: number }[]): number => {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
};
const cutArea = (d: Drawing2D): number => d.cutPolygons.reduce((sum, p) => sum + area(p.polygon.outer) - p.polygon.holes.reduce((h, hole) => h + area(hole), 0), 0);

beforeEach(() => {
  resetProject();
  syncProjectWithModels([{ key: 'm', name: 'm' }], STOREYS);
});

describe('the default plan cut below the next storey (#232)', () => {
  let geometry: GeometryResult | null = null;
  before(async () => { geometry = await meshFile(FIXTURE); });

  it('the project sync cuts the lower plan at exactly 0.5 m, and the top plan at exactly 1.2 m', () => {
    assert.equal(planOf('Lower').cutHeight, 0.5);
    assert.equal(planOf('Upper').cutHeight, 1.2);
  });

  it('storeys 3 m apart keep exactly 1.2 m', () => {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Lower', elevation: 0 }, { name: 'Upper', elevation: 3 }]);
    assert.equal(planOf('Lower').cutHeight, 1.2);
    assert.equal(planOf('Upper').cutHeight, 1.2);
  });

  it('a single-storey model keeps exactly 1.2 m', () => {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Only', elevation: 0 }]);
    assert.equal(planOf('Only').cutHeight, 1.2);
  });

  it('the drawing-set planner, remaking a deleted plan, takes the same cut', () => {
    removeProjectItem(planOf('Lower').id);
    ensureDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 1.3, z: 6 } });
    assert.equal(planOf('Lower').cutHeight, 0.5);
  });

  it('the site plan, made on the ground storey, takes the same cut', () => {
    const id = ensureSitePlan('Site plan');
    assert.ok(id);
    assert.equal((state().views.find((v) => v.id === id) as PlanProjectView).cutHeight, 0.5);
  });

  it('a cut a person set wins: it is kept by a later sync and by the planner', () => {
    updateProjectView(planOf('Lower').id, { cutHeight: 1.2 });
    syncProjectWithModels([{ key: 'm', name: 'm' }], [...STOREYS, { name: 'Roof', elevation: 4 }]);
    ensureDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 1.3, z: 6 } });
    assert.equal(planOf('Lower').cutHeight, 1.2);
  });

  it('the default plan cuts the four walls and not the slab above them', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    assert.ok(Math.abs(boundsOf(geometry)!.max.y - 1.3) < 1e-4);
    const d = await viewDrawing(planOf('Lower'), geometry);
    assert.ok(d, 'the Lower plan drew nothing');
    assert.ok(d.cutPolygons.length >= 4, String(d.cutPolygons.length));
    assert.ok(Math.abs(cutArea(d) - WALL_FOOTPRINT_M2) < 0.01, `cut area ${cutArea(d)} m², walls ${WALL_FOOTPRINT_M2} m²`);
    assert.ok(d.lines.some((l) => l.category === 'projection'), 'the slab above the cut is not drawn in projection');
  });

  it('a person-set 1.2 m cut still runs through the slab: the rule only moves the default', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built'); return; }
    updateProjectView(planOf('Lower').id, { cutHeight: 1.2 });
    const d = await viewDrawing(planOf('Lower'), geometry);
    assert.ok(d);
    assert.ok(Math.abs(cutArea(d) - SLAB_M2) < 0.01, `cut area ${cutArea(d)} m²`);
  });
});
