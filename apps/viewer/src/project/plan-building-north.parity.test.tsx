/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan square to the building, the app against the engine, on the engine's `rotated-site.ifc` (four walls round a
 * 4 x 2 m box in a site turned 48 degrees about Z). The app's real path (`viewDrawing`: `sectionPlaneForView` with the
 * site's rotation, the `useDrawingGeneration` hook) and the engine's (`generateViewDrawings`) both turn the plan by the
 * rotation reduced to a quarter turn (-42 degrees): the walls run along the drawing's axes, and both draw the same cut
 * faces at the same places. A plan saved without `orientation` stays on true north in both, and the app's work plane
 * for drafting on the plan (`viewPlaneConfig`) maps a drawing point to the same world point as the engine's frame.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { drawingToWorld, generateDefaultSet } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { TYPE_VISIBILITY_SEMANTIC_DEFAULTS } from '@/store/constants';
import { meshFile, viewDrawing } from '@/test/view-drawing-harness';
import type { PlanProjectView, ProjectLevel } from './types';

const ROTATED = new URL('../../../../packages/ifcsheet/src/__fixtures__/rotated-site.ifc', import.meta.url);
const DEG = Math.PI / 180;

/** The cut faces, each ring's points rounded to 0.1 mm, sorted: where the walls are, whatever order a side makes them in. */
const faces = (d: Drawing2D) => d.cutPolygons
  .map((p) => p.polygon.outer.map((q) => `${Math.round(q.x * 1e4) / 1e4},${Math.round(q.y * 1e4) / 1e4}`).sort().join(' '))
  .sort();

/** The directions, degrees in [0, 180), of every cut edge longer than 5 cm. */
const angles = (d: Drawing2D) => d.cutPolygons.flatMap((p) => p.polygon.outer.flatMap((a, i, r) => {
  const b = r[(i + 1) % r.length];
  return Math.hypot(b.x - a.x, b.y - a.y) < 0.05 ? [] : [(((Math.atan2(b.y - a.y, b.x - a.x) / DEG) % 180) + 180) % 180];
}));
const offStep = (deg: number, step: number) => Math.abs(deg - Math.round(deg / step) * step);

describe('a plan square to a building its site turns 48 degrees, app against engine (rotated-site.ifc)', () => {
  let geometry: GeometryResult | null = null;
  let model: OpenedModel;
  let levels: readonly ProjectLevel[] = [];
  let plan: PlanProjectView;
  before(async () => {
    geometry = await meshFile(ROTATED);
    if (!geometry) return;
    model = await openModel(new Uint8Array(readFileSync(ROTATED)));
    const set = generateDefaultSet(model);
    assert.ok(set, 'a default set');
    levels = set.levels;
    plan = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && !v.site)!;
  });

  async function both(view: PlanProjectView): Promise<{ app: Drawing2D; engine: Drawing2D }> {
    const app = await viewDrawing(view, geometry!, model.dataStore.spatialHierarchy, { ...TYPE_VISIBILITY_SEMANTIC_DEFAULTS, site: false });
    assert.ok(app, 'the app drew nothing');
    const engine = (await generateViewDrawings([view], model.buildingMeshes, levels, model.extent!)).get(view.id);
    assert.ok(engine, 'the engine drew nothing');
    return { app, engine };
  }

  it('both turn a new plan by -42 degrees: the walls along the axes, the same faces in the same places', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    assert.equal(plan.orientation, 'building');
    const { app, engine } = await both(plan);
    assert.ok(app.cutPolygons.length >= 4, 'the four walls are cut');
    for (const a of angles(app)) assert.ok(offStep(a, 90) < 1e-4, `an app edge at ${a} degrees`);
    assert.deepEqual(faces(app), faces(engine));
    assert.ok(Math.abs(((app.config.plane as { turn?: number }).turn ?? 0) + 42 * DEG) < 1e-9, 'the app plane carries the turn');
  });

  it('both keep a plan saved without the field on true north, the walls at 48 degrees', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const { orientation: _left, ...saved } = { ...plan, id: 'saved' };
    const { app, engine } = await both(saved);
    assert.ok(angles(app).some((a) => offStep(a, 90) > 10), 'the walls are not along the axes');
    assert.deepEqual(faces(app), faces(engine));
  });

  it('the app\'s drafting plane on the plan maps a drawing point to the world point the engine\'s frame gives', async (t) => {
    if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
    const { engine } = await both(plan);
    const { publishDrawingRuntime } = await import('@/lib/drawing/drawing-runtime');
    publishDrawingRuntime({ geometryResult: geometry, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    const { viewPlaneConfig } = await import('./view-plane-config');
    const work = viewPlaneConfig(plan, levels, null);
    assert.ok(work, 'the plan has a work plane');
    const p = { x: 1.25, y: -0.75 };
    const a = drawingToWorld(work, p), b = drawingToWorld(engine.config.plane, p);
    publishDrawingRuntime(null);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-9, `app (${a.x}, ${a.z}) against engine (${b.x}, ${b.z})`);
  });
});
