/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #615, the app against the engine: a plan with a cut that meets nothing (or only the walls, with a slab overhead) is
 * drawn by the app's real path (`viewDrawing`: the `useDrawingGeneration` hook, nothing mocked) and by the engine's
 * sheets (`generateViewDrawings`) from the same meshes, and the two drawings hold the same lines and faces. One level,
 * as the bands are the storey's from two up (the harness has no spatial hierarchy, so the app does not scope them).
 *
 * Fixture (`__fixtures__/plan-cut-above-top.ifc`): walls 0 to 3.0 m, a slab 3.0 to 3.3 m.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult } from '@ifc-lite/geometry';
import { generateViewDrawings } from '@bimvoice/ifcsheet/headless';
import { boundsOf, meshFile, viewDrawing } from '@/test/view-drawing-harness';
import type { PlanProjectView, ProjectLevel } from './types';

const FIXTURE = new URL('./__fixtures__/plan-cut-above-top.ifc', import.meta.url);
const GROUND: ProjectLevel = { name: 'Ground', elevation: 0, storeyGlobalIds: [] };
const BELOW: ProjectLevel = { name: 'Below', elevation: -3, storeyGlobalIds: [] };
const plan = (level: ProjectLevel, cutHeight: number, viewDepth?: number): PlanProjectView =>
  ({ id: `${level.name}-${cutHeight}-${viewDepth ?? 'auto'}`, name: 'plan', createdAt: 0, kind: 'plan', level, cutHeight, ...(viewDepth === undefined ? {} : { viewDepth }) });

/** Every line, the hidden ones the app classifies (`includeHiddenLines: projectionOn`) too: the engine's plans classify them since #623. */
const counts = (d: Drawing2D) => {
  const lines = d.lines;
  return {
    lines: lines.length,
    cut: lines.filter((l) => l.category === 'cut').length,
    projection: lines.filter((l) => l.category === 'projection').length,
    cutPolygons: d.cutPolygons.length,
    projectionPolygons: d.projectionPolygons.length,
  };
};

/** Row: the plan and the least cut faces. */
const ROWS: [string, PlanProjectView, number][] = [
  ['a cut through the walls, a slab overhead', plan(GROUND, 1.2), 4],
  ['a cut below the whole model (the bridge deck above its storey)', plan(BELOW, 1.2), 0],
  ['a cut above the model top', plan(GROUND, 5), 0],
  ['a cut through the walls, depth 0.5', plan(GROUND, 1.2, 0.5), 4],
  ['a cut through the walls, depth 0 (the cut only)', plan(GROUND, 1.2, 0), 4],
];

describe('a one-level plan, app against engine (#615)', () => {
  let geometry: GeometryResult | null = null;
  before(async () => { geometry = await meshFile(FIXTURE); });

  for (const [name, view, minCutPolygons] of ROWS) {
    it(name, async (t) => {
      if (!geometry) { t.skip('wasm bundle not built: run `pnpm build:wasm:fetch` first'); return; }
      const app = await viewDrawing(view, geometry);
      assert.ok(app, 'the app drew nothing');
      const level = view.level;
      const engine = (await generateViewDrawings([view], geometry.meshes, [level], boundsOf(geometry)!)).get(view.id);
      assert.ok(engine, 'the engine drew nothing');
      assert.ok(counts(app).lines > 0, 'an empty drawing proves nothing');
      assert.ok(app.cutPolygons.length >= minCutPolygons);
      assert.deepEqual(counts(engine), counts(app));
    });
  }
});
