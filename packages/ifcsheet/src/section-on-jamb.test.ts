/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #749, section B-B of house-2-storey.ifc: a section that lies on the jamb face of an opening, to within a fraction of a
 * micrometre, cut the layers of the wall differently. The plaster layer was drawn solid across the opening while the brick
 * and the insulation showed it. On `__fixtures__/layered-wall-window.ifc` through the CLI's own path (`openModel`,
 * `generateViewDrawings`): wall #48 runs x 0..6, 0.3 m thick in three layers (brick, insulation, plaster), and its opening
 * (#69) runs x 2..2.6 and 1.0..1.9 m up, so one jamb face stands at x 2.
 *
 * Every layer has to say the same thing at the opening: all of them cut across it, or none, on either side of the jamb
 * within 0.1 µm and looking either way. Which one follows what the section looks at: a plane on the jamb is cut a hair
 * into the side it looks toward, so looking at the solid wall it is solid, and looking into the opening it is open.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingPolygon, Point2D } from '@ifc-lite/drawing-2d';
import type { ProjectLevel, SectionProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { sectionPlaneThrough } from './section-plane.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/layered-wall-window.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the section-on-a-jamb test: ${missing}`);

const WALL = 48;
const JAMB_X = 2;
/** Halfway between the sill (1.0) and the head (1.9). */
const MID_OPENING = 1.45;

/** Whether `p` is inside the polygon (even-odd over its outer ring and holes). */
function inside(polygon: DrawingPolygon, p: Point2D): boolean {
  let hit = false;
  for (const ring of [polygon.polygon.outer, ...polygon.polygon.holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) hit = !hit;
    }
  }
  return hit;
}

/** For each layer of the wall's cut (by material), whether its fill covers the middle of the opening, in the middle of the layer. */
function layersAcrossOpening(drawing: Drawing2D): Map<number, boolean> {
  const byLayer = new Map<number, DrawingPolygon[]>();
  for (const q of drawing.cutPolygons) {
    if (q.entityId !== WALL || q.materialId === undefined) continue;
    byLayer.set(q.materialId, [...(byLayer.get(q.materialId) ?? []), q]);
  }
  const out = new Map<number, boolean>();
  for (const [layer, polygons] of byLayer) {
    const xs = polygons.flatMap((q) => q.polygon.outer.map((p) => p.x));
    const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: MID_OPENING };
    out.set(layer, polygons.some((q) => inside(q, mid)));
  }
  return out;
}

describe.skipIf(missing !== null)('a section on the jamb face of an opening cuts every layer of the wall alike (#749)', () => {
  let model: OpenedModel;
  let levels: ProjectLevel[];
  /** The section across the wall at `x`, looking toward -x (`toward` -1) or +x (`toward` 1), on a plane made the way the SECTION command and the proposed sections make one. */
  const sectionAt = async (x: number, toward: -1 | 1): Promise<Drawing2D> => {
    const custom = sectionPlaneThrough({ x, y: 0, z: 1 }, { x, y: 0, z: -1 }, { x: x + toward, y: 0, z: 0 })!;
    const view: SectionProjectView = { id: `s${x}${toward}`, name: 'S', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: custom.distance, flipped: false, custom } };
    return (await generateViewDrawings([view], model.buildingMeshes, levels, model.extent!)).get(view.id)!;
  };

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    levels = set.levels;
  }, 120_000);

  it('the premise: away from the jamb, a section through the opening leaves every layer open there, one beside it fills every layer', async () => {
    for (const toward of [-1, 1] as const) {
      expect([...layersAcrossOpening(await sectionAt(2.3, toward)).values()]).toEqual([false, false, false]);
      expect([...layersAcrossOpening(await sectionAt(1.7, toward)).values()]).toEqual([true, true, true]);
    }
  });

  for (const toward of [-1, 1] as const) {
    for (const offset of [-1e-7, 0, 1e-7]) {
      it(`on the jamb ${offset === 0 ? 'exactly' : `${offset > 0 ? '+' : ''}${offset} m off it`}, looking toward ${toward < 0 ? '-x' : '+x'}: the three layers agree`, async () => {
        const layers = layersAcrossOpening(await sectionAt(JAMB_X + offset, toward));
        expect(layers.size).toBe(3);
        // The cut is taken a hair into what the section looks at: the solid wall toward -x, the opening toward +x.
        expect([...layers.values()], JSON.stringify([...layers])).toEqual(Array(3).fill(toward < 0));
      });
    }
  }
});
