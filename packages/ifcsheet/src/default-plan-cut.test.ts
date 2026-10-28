/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #232, the engine half: the default plan cut stays below the next storey's
 * floor build-up when that storey is less than 1.2 m up. The viewer's twin is
 * `apps/viewer/src/project/plan-cut-below-next-slab.test.tsx`, same fixture:
 * Lower at 0.0 m holds four 0.85 m walls around an 8 x 6 m room; Upper at 1.0 m
 * holds an 8 x 6 m slab from 0.85 to 1.30 m.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { PlanProjectView, ProjectLevel } from './document.js';
import { defaultPlanCutHeight, defaultViews, planViewFor, syncDefaultViews } from './view-defaults.js';
import { generateDefaultSet, type DefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';

const level = (name: string, elevation: number, floorY?: number): ProjectLevel => ({ name, elevation, storeyGlobalIds: [], ...(floorY === undefined ? {} : { floorY }) });
const cutOf = (l: ProjectLevel, all: ProjectLevel[]): number => defaultPlanCutHeight(l, all);

describe('defaultPlanCutHeight (#232)', () => {
  it('storeys 3 m apart, and 1.7 m apart, keep exactly 1.2 m', () => {
    const [a, b] = [level('A', 0), level('B', 3)];
    expect(cutOf(a, [a, b])).toBe(1.2);
    expect(cutOf(b, [a, b])).toBe(1.2);
    const [c, d] = [level('C', 0), level('D', 1.7)];
    expect(cutOf(c, [c, d])).toBe(1.2);
  });

  it('keeps 0.5 m under the next floor from 1 m up; the midpoint below that', () => {
    const at = (gap: number) => { const l = level('L', 0); return cutOf(l, [l, level('U', gap)]); };
    expect(at(1.25)).toBe(0.75);
    expect(at(1)).toBe(0.5);
    expect(at(0.6)).toBe(0.3);
    expect(at(1.5)).toBe(1);
  });

  it('the Duplex T/FDN case: -1.25 m under 0.0 m cuts at -0.5 m, under the slabs (-0.137 to 0.013 m)', () => {
    const fdn = level('T/FDN', -1.25);
    const cut = fdn.elevation + cutOf(fdn, [fdn, level('Level 1', 0)]);
    expect(cut).toBe(-0.5);
  });

  it('the top storey, a single storey and no levels keep exactly 1.2 m', () => {
    const [a, b] = [level('A', 0), level('B', 1)];
    expect(cutOf(b, [a, b])).toBe(1.2);
    expect(cutOf(a, [a])).toBe(1.2);
    expect(defaultPlanCutHeight(a)).toBe(1.2);
  });

  it('is measured between the floors in the drawing frame, not the nominal elevations', () => {
    // Nominal 3 m apart, but the floors sit 1.0 m apart in the frame.
    const [a, b] = [level('A', 0, 10), level('B', 3, 11)];
    expect(cutOf(a, [a, b])).toBe(0.5);
  });

  it('a level within the match tolerance is the same level, not the next one', () => {
    const [a, twin, up] = [level('A', 0), level('A2', 0.1), level('B', 3)];
    expect(cutOf(a, [a, twin, up])).toBe(1.2);
  });

  it('the default views take it, and views a person set or already have keep theirs', () => {
    const levels = [level('Upper', 1), level('Lower', 0)];
    const views = defaultViews(levels);
    const plan = (name: string) => views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === name)!;
    expect(plan('Lower').cutHeight).toBe(0.5);
    expect(plan('Upper').cutHeight).toBe(1.2);
    expect(planViewFor(levels[1], [], 0, levels).cutHeight).toBe(0.5);
    const edited = views.map((v) => (v.kind === 'plan' && v.name === 'Lower' ? { ...v, cutHeight: 1.2 } : v));
    const synced = syncDefaultViews(edited, [...levels, level('Roof', 5)]);
    expect((synced.find((v) => v.kind === 'plan' && v.name === 'Lower') as PlanProjectView).cutHeight).toBe(1.2);
  });
});

const FIXTURE = fileURLToPath(new URL('../../../apps/viewer/src/project/__fixtures__/plan-cut-below-next-slab.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FIXTURE) ? 'plan-cut-below-next-slab.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the default-plan-cut fixture test: ${missing}`);

const WALL_FOOTPRINT_M2 = 8 * 6 - 7.6 * 5.6;
const area = (points: readonly { x: number; y: number }[]): number => {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
};
const cutArea = (d: Drawing2D): number => d.cutPolygons.reduce((sum, p) => sum + area(p.polygon.outer) - p.polygon.holes.reduce((h, hole) => h + area(hole), 0), 0);

describe.skipIf(missing !== null)('the default plan cut below the next slab, in the engine (#232)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  const plan = (name: string): PlanProjectView => set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && v.name === name)!;
  const draw = async (view: PlanProjectView): Promise<Drawing2D> => (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent!)).get(view.id)!;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const made = generateDefaultSet(model, { now: 0 });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
  }, 120_000);

  it('the set cuts the lower plan at exactly 0.5 m and the top plan at 1.2 m', () => {
    expect(plan('Lower').cutHeight).toBe(0.5);
    expect(plan('Upper').cutHeight).toBe(1.2);
  });

  it('the default lower plan cuts the four walls and not the slab above them', async () => {
    const d = await draw(plan('Lower'));
    expect(d.cutPolygons.length).toBeGreaterThanOrEqual(4);
    expect(cutArea(d)).toBeCloseTo(WALL_FOOTPRINT_M2, 2);
  });

  it('a person-set 1.2 m cut still runs through the slab', async () => {
    const d = await draw({ ...plan('Lower'), cutHeight: 1.2 });
    expect(cutArea(d)).toBeCloseTo(48, 2);
  });
});
