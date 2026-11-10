/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #749: a section and the openings of the wall it cuts, on `__fixtures__/host-wall-window.ifc` through the CLI's own path
 * (`openModel`, `generateViewDrawings`). Wall A (#48) runs along x 0..6, 0.3 m thick and 3 m high; its opening (#69) is
 * x 2..3 and 1.5..2.1 m up, filled by a window (#75) of x 2.05..2.95.
 *
 * - A section through the opening shows it: the wall is cut below the sill and above the head, the window between them.
 * - A section 0.15 m beside the opening cuts solid wall, so the wall is one face, and the window and the opening's edges,
 *   inside the wall behind that face, are left out, visible and hidden alike. They used to print as visible lines over the
 *   wall's cut fill, which read as the wall drawn across a window (the section A-A of the issue, 0.15 m beside its window),
 *   and then as dashes over it, which printed as stray marks (bloc-p4 Section A-A).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D, DrawingPolygon, Point2D } from '@ifc-lite/drawing-2d';
import type { ProjectLevel, SectionProjectView } from './document.js';
import { generateDefaultSet } from './default-set.js';
import { generateViewDrawings, openModel, type OpenedModel } from './headless.js';
import { sectionPlaneThrough } from './section-plane.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/host-wall-window.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = existsSync(WASM) || process.env.CI ? null : 'wasm bundle not built: run `pnpm build:wasm:fetch`';
if (missing) console.warn(`[ifcsheet] skipping the section-through-an-opening test: ${missing}`);

const WALL = 48, WINDOW = 75;
const SILL = 1.5, HEAD = 2.1;

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

const spanY = (polygons: readonly DrawingPolygon[]) => polygons.map((q) => {
  const ys = q.polygon.outer.map((p) => p.y);
  return [Math.min(...ys), Math.max(...ys)] as const;
});

describe.skipIf(missing !== null)('a section and the openings of the wall it cuts (#749)', () => {
  let model: OpenedModel;
  let levels: ProjectLevel[];
  /** The section across wall A at `x`, looking toward -x, on a plane drawn across the plan the way the SECTION command and the proposed sections make one. */
  const sectionAt = async (x: number, meshes = model.buildingMeshes, showHidden?: boolean): Promise<Drawing2D> => {
    const custom = sectionPlaneThrough({ x, y: 0, z: 1 }, { x, y: 0, z: -1 }, { x: x - 1, y: 0, z: 0 })!;
    const view: SectionProjectView = { id: `s${x}`, name: 'S', kind: 'section', createdAt: 0, plane: { axis: 'front', offset: custom.distance, flipped: false, custom }, ...(showHidden === undefined ? {} : { showHidden }) };
    return (await generateViewDrawings([view], meshes, levels, model.extent!)).get(view.id)!;
  };

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FIXTURE)));
    const set = generateDefaultSet(model, { now: 0 });
    if (!set || !model.extent) throw new Error('no set: the model has no extent');
    levels = set.levels;
  }, 120_000);

  it('a section draws no hidden line unless the view says showHidden: true (#557)', async () => {
    const isHidden = (l: Drawing2D['lines'][number]) => l.visibility === 'hidden' || l.category === 'hidden';
    const off = await sectionAt(2.5);
    const on = await sectionAt(2.5, model.buildingMeshes, true);
    expect(off.lines.filter(isHidden)).toHaveLength(0);
    expect(on.lines.filter(isHidden).length).toBeGreaterThan(0);
  });

  it('a section through the opening cuts the wall below the sill and above the head, and the window between', async () => {
    const drawing = await sectionAt(2.5);
    const wall = drawing.cutPolygons.filter((q) => q.entityId === WALL);
    const spans = spanY(wall);
    expect(spans.some(([lo, hi]) => lo <= 0.01 && Math.abs(hi - SILL) < 0.01)).toBe(true);
    expect(spans.some(([lo, hi]) => Math.abs(lo - HEAD) < 0.01 && hi >= 2.99)).toBe(true);
    // No wall fill between the sill and the head, across the wall's thickness.
    const xs = wall.flatMap((q) => q.polygon.outer.map((p) => p.x));
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    for (let y = SILL + 0.05; y < HEAD; y += 0.1) {
      for (let x = x0 + 0.02; x < x1; x += 0.05) expect(wall.some((q) => inside(q, { x, y }))).toBe(false);
    }
    expect(drawing.cutPolygons.some((q) => q.entityId === WINDOW)).toBe(true);
  });

  describe('a section 0.15 m beside the opening, in solid wall', () => {
    let drawing: Drawing2D;
    let wallFaces: DrawingPolygon[];
    beforeAll(async () => {
      drawing = await sectionAt(3.15);
      wallFaces = drawing.cutPolygons.filter((q) => q.entityId === WALL);
    });

    it('the premise: it cuts the wall as one face, full height, and does not cut the window', () => {
      expect(spanY(wallFaces).some(([lo, hi]) => lo <= 0.01 && hi >= 2.99)).toBe(true);
      expect(drawing.cutPolygons.some((q) => q.entityId === WINDOW)).toBe(false);
    });

    it('the premise: with the wall taken away, the same section draws the window 0.2 m behind the plane', async () => {
      const windowAlone = await sectionAt(3.15, model.buildingMeshes.filter((m) => m.expressId === WINDOW));
      expect(windowAlone.lines.some((l) => l.entityId === WINDOW && l.visibility === 'visible')).toBe(true);
    });

    it('draws no line, visible or hidden, inside the wall\'s cut face: the window and the opening\'s edges behind it are left out', () => {
      const linesInside = drawing.lines.filter((l) => {
        if (l.category === 'cut') return false;
        const mid = { x: (l.line.start.x + l.line.end.x) / 2, y: (l.line.start.y + l.line.end.y) / 2 };
        // Off the face's outline by a millimetre: a wall face running on behind the plane keeps its line on the cut outline.
        const near = (p: Point2D) => wallFaces.some((q) => inside(q, p));
        return near(mid) && [[0.001, 0], [-0.001, 0], [0, 0.001], [0, -0.001]].every(([dx, dy]) => near({ x: mid.x + dx, y: mid.y + dy }));
      });
      expect(linesInside.map((l) => `${l.entityId} ${l.ifcType} ${l.visibility}`)).toEqual([]);
      expect(drawing.lines.filter((l) => l.entityId === WINDOW).map((l) => l.visibility)).toEqual([]);
    });
  });
});
