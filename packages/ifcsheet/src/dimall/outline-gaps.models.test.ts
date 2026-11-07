/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #642 on the models it was found on, the plans drawn by the engine: rvt01's first and ground floors left strings out
 * because their outline was torn by gaps something else on the plan fills (column casings, a door at a corner), and the
 * IfcOpenHouse ran a 4.64 string between the inner faces of two walls because its glazed south-west corner was open.
 * The fixtures are fetched with `pnpm fixtures`; the test skips without them.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanProjectView } from '../document.js';
import { generateDefaultSet } from '../default-set.js';
import { generateViewDrawings, openModel } from '../headless.js';
import type { Pt } from '../draft-types.js';
import { boxOf, pointInRing } from './outline.js';
import { planParts } from './parts.js';
import { planDimensions, stringLine } from './plan.js';
import type { DimensionPlan, PlanPart } from './types.js';

const MODELS = fileURLToPath(new URL('../../../../tests/models/', import.meta.url));
const RVT01 = MODELS + 'various/rvt01.ifc';
const HOUSE = MODELS + 'ara3d/IfcOpenHouse_IFC4.ifc';
const WASM = fileURLToPath(new URL('../../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : !existsSync(RVT01) || !existsSync(HOUSE) ? 'rvt01.ifc or IfcOpenHouse_IFC4.ifc not found: run `pnpm fixtures`' : null;
if (missing) console.warn(`[ifcsheet] skipping the #642 outline test on real models: ${missing}`);

const SETTINGS = { paperUnit: 0.1, textHeight: 0.25 };

/** The parts of each storey's floor plan of the model, by level name. */
async function plansOf(file: string): Promise<Map<string, PlanPart[]>> {
  const model = await openModel(new Uint8Array(readFileSync(file)));
  const set = generateDefaultSet(model, { now: 0 });
  if (!set || !model.extent) throw new Error(`no set for ${file}`);
  const plans = set.document.views.filter((v): v is PlanProjectView => v.kind === 'plan' && !v.site && !v.discipline && !v.reflected);
  const drawings = await generateViewDrawings(plans, model.buildingMeshes, set.levels, model.extent);
  return new Map(plans.map((v) => [v.level.name, planParts(drawings.get(v.id), model.buildingMeshes)]));
}

/** Whether the segment from `a` to `b` runs into the ring: a point of it inside, or an edge it crosses. */
function crossesRing(a: Pt, b: Pt, ring: readonly Pt[]): boolean {
  const at = (t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  for (let k = 0; k <= 200; k++) if (pointInRing(at(k / 200), ring)) return true;
  const side = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return ring.some((c, i) => {
    const d = ring[(i + 1) % ring.length];
    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  });
}

const lengthOf = (p: DimensionPlan, kind: string) => p.strings.filter((s) => s.kind === kind).map((s) => Math.hypot(s.points[s.points.length - 1].x - s.points[0].x, s.points[s.points.length - 1].y - s.points[0].y));

describe.skipIf(missing !== null)('#642: the outline of a plan whose gaps something stands in, on real models', () => {
  let rvt01: Map<string, PlanPart[]>, house: Map<string, PlanPart[]>;
  beforeAll(async () => {
    rvt01 = await plansOf(RVT01);
    house = await plansOf(HOUSE);
  }, 600_000);

  const level = (prefix: string) => [...rvt01].find(([name]) => name.startsWith(prefix))?.[1] ?? [];

  it('leaves no string out on rvt01 (F1 left 15 out and the ground floor 17), and draws as many', () => {
    const f1 = planDimensions(level('F1'), SETTINGS);
    const gr = planDimensions(level('GR'), SETTINGS);
    expect([f1.droppedStrings, gr.droppedStrings]).toEqual([0, 0]);
    expect(f1.strings.length).toBeGreaterThanOrEqual(16);
    expect(gr.strings.length).toBeGreaterThanOrEqual(19);
  });

  it('stands no string of rvt01 across a wall: not across the site wall round the plot, on the ground floor or at road level', () => {
    for (const prefix of ['GR', 'RD']) {
      const parts = level(prefix);
      const rings = parts.filter((q) => q.kind === 'wall').flatMap((q) => q.rings);
      const plan = planDimensions(parts, SETTINGS);
      expect(plan.strings.length, prefix).toBeGreaterThan(0);
      for (const s of plan.strings) {
        // Its ends may lie on a wall, at an inner corner, up to a finish coat into it: the line is tested 50 mm short of them.
        const { a, b } = stringLine(s);
        const [a1, b1] = [{ x: a.x + s.along.x * 0.05, y: a.y + s.along.y * 0.05 }, { x: b.x - s.along.x * 0.05, y: b.y - s.along.y * 0.05 }];
        expect(rings.some((r) => crossesRing(a1, b1, r)), `${prefix} ${s.key} stands across a wall`).toBe(false);
      }
    }
  });

  it('stands every string of the IfcOpenHouse outside its walls: no 4.64 between the inner faces', () => {
    const parts = [...house.values()].find((p) => p.some((q) => q.kind === 'wall')) ?? [];
    const p = planDimensions(parts, SETTINGS);
    expect(lengthOf(p, 'overall').some((v) => Math.abs(v - 4.64) < 0.01)).toBe(false);
    const walls = boxOf(parts.filter((q) => q.kind === 'wall').flatMap((q) => q.rings.flat()));
    for (const s of p.strings) {
      for (const pt of s.points) {
        const q = { x: pt.x + s.outward.x * s.offset, y: pt.y + s.outward.y * s.offset };
        expect(q.x < walls.x0 || q.x > walls.x1 || q.y < walls.y0 || q.y > walls.y1, `${s.key} stands outside the walls`).toBe(true);
      }
    }
  });
});
