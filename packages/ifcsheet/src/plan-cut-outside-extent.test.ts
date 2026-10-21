/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #226, the engine half: a plan whose cut lies outside the model's extent cuts
 * nothing, as in the viewer (`apps/viewer/src/project/plan-cut-outside-extent.test.tsx`,
 * same fixture). The engine carries the cut in metres to the generator.
 *
 * The fixture: Nivel 1 at 0.0 m holds four 3.0 m walls, 0.2 m thick, around an
 * 8 x 6 m room; Nivel 2 at 3.0 m holds only an 8 x 6 m slab from 3.0 to 3.3 m,
 * so the model top is the slab's top face.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { PlanProjectView, ProjectLevel } from './document.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';

const FIXTURE = fileURLToPath(new URL('../../../apps/viewer/src/project/__fixtures__/plan-cut-above-top.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FIXTURE) ? 'plan-cut-above-top.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the plan-cut-outside-extent test: ${missing}`);

const NIVEL_1: ProjectLevel = { name: 'Nivel 1', elevation: 0, storeyGlobalIds: [] };
const NIVEL_2: ProjectLevel = { name: 'Nivel 2', elevation: 3, storeyGlobalIds: [] };
const BASEMENT: ProjectLevel = { name: 'Basement', elevation: -3, storeyGlobalIds: [] };

/** The four walls' footprints, from the fixture: an 8 x 6 m outline less the 7.6 x 5.6 m room inside it. */
const WALL_FOOTPRINT_M2 = 8 * 6 - 7.6 * 5.6;

const plan = (level: ProjectLevel, cutHeight: number, viewDepth?: number): PlanProjectView =>
  ({ id: `${level.name}@${cutHeight}/${viewDepth ?? '-'}`, name: `${level.name} @ ${cutHeight}`, createdAt: 0, kind: 'plan', level, cutHeight, ...(viewDepth === undefined ? {} : { viewDepth }) });

const area = (points: readonly { x: number; y: number }[]): number => {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
};
const cutArea = (d: Drawing2D): number => d.cutPolygons.reduce((sum, p) => sum + area(p.polygon.outer) - p.polygon.holes.reduce((h, hole) => h + area(hole), 0), 0);

describe.skipIf(missing !== null)('a plan cut outside the model extent, in the engine (#226)', () => {
  let model: OpenedModel;
  let drawings: Map<string, Drawing2D>;
  const views = [plan(NIVEL_2, 1.2), plan(BASEMENT, 1.2), plan(NIVEL_2, 0.301), plan(NIVEL_1, 1.2), plan(NIVEL_2, 1.2, 0.5)];

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    drawings = await generateViewDrawings(views, model.buildingMeshes, [NIVEL_1, NIVEL_2, BASEMENT], model.extent!);
  }, 120_000);

  it('the fixture tops out at the slab top face, 3.3 m', () => {
    expect(model.extent!.max.y).toBeCloseTo(3.3, 4);
    expect(model.extent!.min.y).toBeCloseTo(0, 4);
  });

  it.each([
    ['above the model top (4.2 m)', 0],
    ['below the model bottom (-1.8 m)', 1],
    ['a millimetre above the top face', 2],
  ])('a cut %s cuts nothing', (_name, index) => {
    const d = drawings.get(views[index].id)!;
    expect(d).toBeDefined();
    expect(d.cutPolygons).toHaveLength(0);
    expect(d.lines.filter((l) => l.category === 'cut')).toHaveLength(0);
  });

  it('a view depth from a cut above the model runs down from the model top, as in the viewer', () => {
    // 0.5 m down from a 4.2 m cut ends at 3.7 m, above the slab; from the model top, 3.3 m, it reaches 2.8 m and sees the slab.
    const d = drawings.get(views[4].id)!;
    expect(d.cutPolygons).toHaveLength(0);
    expect(d.lines.filter((l) => l.category === 'projection').length).toBeGreaterThan(0);
  });

  it('a mid-storey cut cuts the four walls, and only they', () => {
    const d = drawings.get(views[3].id)!;
    expect(d.cutPolygons.length).toBeGreaterThanOrEqual(4);
    expect(cutArea(d)).toBeCloseTo(WALL_FOOTPRINT_M2, 2);
  });
});
