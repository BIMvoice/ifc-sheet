/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #678: a door on a plan sits in its opening. The door's mesh is its leaf and frame, thinner than the wall it stands in and wider than
 * the hole by its lining, so a symbol drawn on that footprint put the hinge, the leaf and the arc over the wall band. The symbol is
 * fitted to the wall (`opening-in-wall.ts`): the hinge on the wall's face, the jambs at the void's faces.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel } from './headless.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { hostWallMeshes } from './opening-in-wall.js';
import { openingHostsOf } from './opening-hosts.js';
import { openingSymbols } from './opening-symbols.js';
import { planOpeningSymbols } from './plan-openings.js';
import { resolveViewGraphics } from './view-templates.js';
import type { PlanProjectView } from './document.js';

const plane: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };

/** The corners of the box `x0..x1` by `y0..y1` by `z0..z1`, plus `extraX` columns at both faces (a wall's void jambs). */
function box(expressId: number, ifcType: string, [x0, x1]: [number, number], [z0, z1]: [number, number], height: number, extraX: number[] = []): MeshData {
  const positions: number[] = [];
  for (const x of [x0, ...extraX, x1]) for (const z of [z0, z1]) for (const y of [0, height]) positions.push(x, y, z);
  return { expressId, ifcType, positions: new Float32Array(positions), indices: new Uint32Array(0), normals: new Float32Array(0), color: [1, 1, 1, 1] } as unknown as MeshData;
}

const xs = (pts: { x: number; y: number }[]) => [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
const ys = (pts: { x: number; y: number }[]) => [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];

describe('a door in a wall it is thinner than (#678, stated invariant)', () => {
  // A 0.2 m wall (z -0.2 to 0) with a 0.9 m void from x 1.525 to 2.425; the door's frame 0.95 m wide (its lining 25 mm into the wall each
  // side) and 0.115 m deep, in the outer half of the wall and 15 mm proud of its face.
  const wall = box(1, 'IfcWall', [0, 4], [-0.2, 0], 3, [1.525, 2.425]);
  const door = box(2, 'IfcDoor', [1.5, 2.45], [-0.1, 0.015], 2);
  const symbols = (fitted: boolean) => openingSymbols([door], plane, () => 0, () => null, () => null, () => false, fitted ? hostWallMeshes([wall, door], (id) => (id === 2 ? 1 : undefined)) : undefined);

  it('draws the leaf from the wall face, within the void, and the swing as wide as the void', () => {
    const [symbol] = symbols(true);
    const leaf = symbol.heavy![0];
    expect(leaf.type).toBe('polyline');
    if (leaf.type !== 'polyline') return;
    const [x0, x1] = xs(leaf.pts), [y0, y1] = ys(leaf.pts);
    // Within the void, not on the wall's ends (a leaf's own thickness runs along the jamb, into the opening).
    expect(x0).toBeGreaterThanOrEqual(1.525 - 1e-4);
    expect(x1).toBeLessThanOrEqual(2.425 + 1e-4);
    // Off the wall band (z -0.2 to 0): the leaf starts at a wall face and goes away from it.
    const overWall = Math.min(y1, 0) - Math.max(y0, -0.2);
    expect(overWall, 'the leaf lies over the wall band').toBeLessThanOrEqual(1e-4);
    const arc = symbol.shapes.find((s) => s.type === 'arc');
    expect(arc?.type === 'arc' ? arc.r : 0).toBeCloseTo(0.9, 3);
  });

  it('leaves a door with no host wall as it was: the frame footprint', () => {
    const leaf = symbols(false)[0].heavy![0];
    if (leaf.type !== 'polyline') throw new Error('no leaf');
    expect(xs(leaf.pts)[0]).toBeCloseTo(1.5, 3);
  });

  it('leaves the door alone when its wall does not hold it (a door beside a wall, not in it)', () => {
    const away = box(3, 'IfcWall', [0, 4], [3, 3.2], 3);
    const [symbol] = openingSymbols([door], plane, () => 0, () => null, () => null, () => false, hostWallMeshes([away], () => 3));
    const leaf = symbol.heavy![0];
    if (leaf.type !== 'polyline') throw new Error('no leaf');
    expect(xs(leaf.pts)[0]).toBeCloseTo(1.5, 3);
  });
});

const LLOYD = '/Users/petruc/dev/bimvoice/_workspace/models/lloyd/ifc-from-bonsai-2026-11-03.ifc';
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(LLOYD) ? 'the Bonsai house model is not on this machine (it is not a committed fixture)' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the doors-in-openings test on the real model: ${missing}`);

describe.skipIf(missing !== null)('every door of the ground floor plan sits in its opening (#678, the Bonsai house)', () => {
  it('has no door line over a wall cut', async () => {
    const model = await openModel(new Uint8Array(readFileSync(LLOYD)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent || !model.dataStore) throw new Error('no set');
    const view = set.document.views.find((v): v is PlanProjectView => v.kind === 'plan' && /Ground/.test(v.name))!;
    const drawing = (await generateViewDrawings([view], model.buildingMeshes, set.levels, model.extent)).get(view.id)!;
    const sources = { live: { dataStore: model.dataStore, view: null }, project: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING } };
    const doors = planOpeningSymbols(model.buildingMeshes, drawing.config.plane, sources, resolveViewGraphics(view, set.document.viewTemplates), view.level).filter((s) => s.kind === 'door');
    expect(doors.length, 'the five doors').toBe(5);
    expect(openingHostsOf(model.dataStore).size).toBeGreaterThan(0);
    const walls = drawing.cutPolygons.filter((c) => /^IfcWall/i.test(c.ifcType));
    expect(walls.length).toBeGreaterThan(0);
    for (const door of doors) {
      for (const leaf of door.heavy ?? []) {
        if (leaf.type !== 'polyline') continue;
        const [lx0, lx1] = xs(leaf.pts), [ly0, ly1] = ys(leaf.pts);
        for (const wall of walls) {
          const [wx0, wx1] = xs(wall.polygon.outer), [wy0, wy1] = ys(wall.polygon.outer);
          // A leaf may touch a wall's end; it may not cross into its band (a centimetre of slack for a wall turned a few milliradians).
          const over = Math.min(lx1, wx1) - Math.max(lx0, wx0) > 0.01 && Math.min(ly1, wy1) - Math.max(ly0, wy0) > 0.01;
          expect(over, `door ${door.id} over wall ${wall.entityId}`).toBe(false);
        }
      }
    }
  }, 180_000);
});
