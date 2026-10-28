/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #97 on a real model: AC20-FZK-Haus, the ground floor (Erdgeschoss) cut at
 * its default plan height (1.2 m, `defaultPlanCutHeight`), seen from the
 * south-east corner. The viewer frame puts the house at x 0..12 m, z -10..0 m
 * (z grows to the south), floor at y = 0.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingLine, Point2D } from '@ifc-lite/drawing-2d';
import { axonometricCamera, drawAxonometricView, nominalScaleFactor } from './axonometric.js';
import type { PlanProjectView, ProjectLevel } from './document.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { defaultPlanCutHeight, levelsFromStoreys } from './view-defaults.js';
import type { ThreeDProjectView } from './view-3d-types.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus cut-away test: ${missing}`);

type V3 = { x: number; y: number; z: number };

describe.skipIf(missing !== null)('a cut-away axonometric of the FZK-Haus ground floor (#97)', () => {
  let model: OpenedModel;
  let levels: ProjectLevel[];
  let ground: ProjectLevel;
  let cut: number;
  let view: ThreeDProjectView;
  let drawing: Drawing2D;
  let k: number;

  /** A drawing point back in the world (see `axonometric-cutaway.test.ts`). */
  const worldOf = (p: Point2D, depth: number): V3 => {
    const c = drawing.config.plane.customPlane!;
    const x = p.x / k;
    const y = p.y / k;
    return { x: c.origin.x + c.tangent.x * x + c.bitangent.x * y - c.normal.x * depth, y: c.origin.y + c.tangent.y * x + c.bitangent.y * y - c.normal.y * depth, z: c.origin.z + c.tangent.z * x + c.bitangent.z * y - c.normal.z * depth };
  };
  const ends = (l: DrawingLine): [V3, V3] => [worldOf(l.line.start, l.depth), worldOf(l.line.end, l.depthEnd ?? l.depth)];
  const near = (p: V3, a: V3, b: V3): number => {
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x ** 2 + ab.y ** 2 + ab.z ** 2)));
    return Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t, p.z - a.z - ab.z * t);
  };
  const ringArea = (ring: readonly Point2D[]): number => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
  const faceArea = (d: Drawing2D): number => d.cutPolygons.reduce((s, p) => s + ringArea(p.polygon.outer) - p.polygon.holes.reduce((h, r) => h + ringArea(r), 0), 0);

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    levels = levelsFromStoreys(model.storeys);
    ground = levels.find((l) => l.name === 'Erdgeschoss')!;
    cut = defaultPlanCutHeight(ground, levels);
    view = { id: 'axo', kind: '3d', name: 'Erdgeschoss cut-away', createdAt: 0, viewpoint: null, projection: 'axonometric', preset: 'se', scale: 100, cutaway: { storey: { level: ground, cutHeight: cut } } };
    const t0 = performance.now();
    drawing = await drawAxonometricView(model.buildingMeshes, view, levels);
    console.info(`[#97] FZK-Haus ground-floor cut-away: ${(performance.now() - t0).toFixed(0)} ms, ${drawing.lines.length} lines, ${drawing.cutPolygons.length} cut faces`);
    k = nominalScaleFactor(axonometricCamera(view));
  }, 300_000);

  it('is cut at the default plan height and comes out as vector line work and filled faces', () => {
    expect(cut).toBe(1.2);
    expect(drawing.lines.filter((l) => l.visibility === 'visible').length).toBeGreaterThan(500);
    expect(drawing.lines.filter((l) => l.category === 'cut').length).toBeGreaterThan(100);
    expect(drawing.cutPolygons.length).toBeGreaterThan(20);
  });

  it('draws nothing above the cut', () => {
    const heights = drawing.lines.flatMap((l) => ends(l).map((p) => p.y));
    expect(Math.max(...heights)).toBeLessThan(cut + 1e-3);
  });

  it('fills the cut walls with the plan\'s own cut faces, seen at the isometric angle and the nominal scale', async () => {
    const plan: PlanProjectView = { id: 'plan', kind: 'plan', name: 'Erdgeschoss', createdAt: 0, level: ground, cutHeight: cut, viewDepth: 0 };
    const planDrawing = (await generateViewDrawings([plan], model.buildingMeshes, levels, model.extent!)).get('plan')!;
    const walls = (d: Drawing2D) => new Set(d.cutPolygons.filter((p) => p.ifcType.startsWith('IfcWall')).map((p) => p.entityId));
    expect([...walls(drawing)].sort()).toEqual([...walls(planDrawing)].sort());
    expect(walls(drawing).size).toBeGreaterThan(5);
    // A horizontal face is foreshortened by 1/sqrt(3) and the nominal scale enlarges areas by 3/2: sqrt(3)/2 in all.
    expect(faceArea(drawing) / faceArea(planDrawing)).toBeCloseTo(Math.sqrt(3) / 2, 6);
  });

  it('hides the floor slab\'s north edge, which lies behind the north wall seen from the south-east', () => {
    // IfcSlab: the ground slab's top north edge, at the foot of the north wall's outer face.
    const a = { x: 0.5, y: 0, z: -10 };
    const b = { x: 11, y: 0, z: -10 };
    const on = drawing.lines.filter((l) => l.ifcType === 'IfcSlab' && ends(l).every((p) => near(p, { x: 0, y: 0, z: -10 }, { x: 11.4, y: 0, z: -10 }) < 0.02));
    expect(on.length).toBeGreaterThan(0);
    expect(on.filter((l) => l.visibility === 'visible')).toEqual([]);
    // No visible line of any element runs along it either.
    expect(drawing.lines.filter((l) => l.visibility === 'visible' && ends(l).every((p) => near(p, a, b) < 0.02))).toEqual([]);
  });

  it('the engine\'s set draws the same view as the axonometric function, hidden lines left out', async () => {
    const out = await generateViewDrawings([view], model.buildingMeshes, levels, model.extent!);
    const set = out.get('axo')!;
    expect(set.cutPolygons).toEqual(drawing.cutPolygons);
    expect(set.lines).toEqual(drawing.lines.filter((l) => l.visibility !== 'hidden'));
  });
});
