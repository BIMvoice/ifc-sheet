/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { asSheetDrawing, axonometricCamera, generateAxonometricDrawing, presetViewDirection, projectionOf } from './axonometric.js';
import { drawingAsViewShows } from './view-appearance.js';
import { drawingToScreen } from '@/drafting/frame';
import type { ThreeDProjectView } from './types.js';

/**
 * The frame of an axonometric, against the ANALYTIC isometric projection and
 * not against the engine's own basis. The viewer frame is X east, Y up, Z
 * south; a camera at the south-east corner looks along (-1, -1, -1), so the
 * screen axes are
 *   right = (1, 0, -1) / sqrt 2      up = (-1, 2, -1) / sqrt 6
 * and a point lands at X = (x - z) / sqrt 2, Y = (-x + 2y - z) / sqrt 6. The
 * drawing is centred on the model's box (`buildCameraSectionPlane`: its
 * origin is the box centre's projection), so a point's drawing coordinates are
 * iso(point) - iso(box centre).
 */
const R2 = Math.SQRT2;
const R6 = Math.sqrt(6);
type P3 = readonly [number, number, number];
const iso = ([x, y, z]: P3) => ({ x: (x - z) / R2, y: (-x + 2 * y - z) / R6 });

/** An axis-aligned box between two corners, wound outward. */
function box(expressId: number, [x0, y0, z0]: P3, [x1, y1, z1]: P3): MeshData {
  const positions = new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { expressId, ifcType: 'IfcWall', modelIndex: 0, positions, normals: new Float32Array(positions.length), indices, color: [1, 1, 1, 1] } as MeshData;
}

const MIN: P3 = [10, 2, -5];
const MAX: P3 = [11, 3, -4];
const CENTRE: P3 = [10.5, 2.5, -4.5];
const cube = () => box(1, MIN, MAX);
const corner = (cx: 0 | 1, cy: 0 | 1, cz: 0 | 1): P3 => [cx ? MAX[0] : MIN[0], cy ? MAX[1] : MIN[1], cz ? MAX[2] : MIN[2]];

const view = (patch: Partial<ThreeDProjectView> = {}): ThreeDProjectView => ({
  id: 'v', kind: '3d', name: 'Axo', createdAt: 0, viewpoint: null, projection: 'axonometric', preset: 'se', scale: 100, ...patch,
});

/** A drawing point on paper at 1:100 (10 mm per metre) through the sheet's own frame, y down. */
const onPaper = (p: { x: number; y: number }) => drawingToScreen(p, { scale: 10, x: 0, y: 0 }, 'front');
/** Where a model point must land on paper, from the analytic projection alone. */
const expectedOnPaper = (p: P3) => {
  const a = iso(p);
  const c = iso(CENTRE);
  return { x: (a.x - c.x) * 10, y: -(a.y - c.y) * 10 };
};
const isHidden = (l: { visibility?: string; category?: string }) => l.visibility === 'hidden' || l.category === 'hidden';
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('axonometric frame (issue #49)', () => {
  it('projects a cube to the analytic SE isometric within 0.1 mm at 1:100, with up still up on paper', async () => {
    const drawing = await generateAxonometricDrawing([cube()], view());
    const drawn = drawing.lines.flatMap((l) => [onPaper(l.line.start), onPaper(l.line.end)]);
    // The seven corners an isometric cube shows; the eighth, the far bottom corner, is behind the near top one.
    for (const cx of [0, 1] as const) for (const cy of [0, 1] as const) for (const cz of [0, 1] as const) {
      if (cx === 0 && cy === 0 && cz === 0) continue;
      const want = expectedOnPaper(corner(cx, cy, cz));
      assert.ok(drawn.some((p) => dist(p, want) < 0.1), `corner ${cx}${cy}${cz} is drawn at (${want.x.toFixed(2)}, ${want.y.toFixed(2)}) mm`);
    }
    // Up stays up: the east-south-west vertical edge's top end is higher on paper (smaller y) than its bottom end.
    const top = expectedOnPaper(corner(0, 1, 1));
    const bottom = expectedOnPaper(corner(0, 0, 1));
    assert.ok(top.y < bottom.y, 'analytic: top above bottom');
    const vertical = drawing.lines.find((l) => dist(onPaper(l.line.start), top) < 0.1 && dist(onPaper(l.line.end), bottom) < 0.1)
      ?? drawing.lines.find((l) => dist(onPaper(l.line.end), top) < 0.1 && dist(onPaper(l.line.start), bottom) < 0.1);
    assert.ok(vertical, 'the vertical edge is drawn, top end above its bottom end');
    // The silhouette is the isometric cube's: sqrt 2 wide, sqrt(8/3) tall, metres at 1:100.
    const xs = drawn.map((p) => p.x);
    const ys = drawn.map((p) => p.y);
    assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - R2 * 10) < 0.1);
    assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) - Math.sqrt(8 / 3) * 10) < 0.1);
  });

  it('draws the three back edges neither visible nor dashed: they are behind the solid and left out', async () => {
    const drawing = await generateAxonometricDrawing([cube()], view());
    const back = corner(0, 0, 0);
    const midpoints = [corner(1, 0, 0), corner(0, 1, 0), corner(0, 0, 1)].map((end) => expectedOnPaper(back.map((v, i) => (v + end[i]) / 2) as unknown as P3));
    for (const mid of midpoints) {
      const through = drawing.lines.filter((l) => {
        const a = onPaper(l.line.start);
        const b = onPaper(l.line.end);
        const len = dist(a, b);
        const t = Math.max(0, Math.min(1, ((mid.x - a.x) * (b.x - a.x) + (mid.y - a.y) * (b.y - a.y)) / (len * len)));
        return dist(mid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) < 0.1;
      });
      assert.deepEqual(through, [], `nothing is drawn along the back edge through (${mid.x.toFixed(2)}, ${mid.y.toFixed(2)}) mm`);
    }
    assert.equal(drawing.lines.length, 9, 'six outline edges and the three facing creases');
    assert.equal(drawing.lines.filter(isHidden).length, 0, 'none of them is classified hidden: the outline is whole');
  });

  it('draws what another element covers hidden: omitted from the sheet by default, dashed when the view asks', async () => {
    const front = box(1, [10, 2, -6], [14, 6, -2]);
    const behind = box(2, [8.5, 0.5, -7.5], [9.5, 1.5, -6.5]); // straight behind the big box along (-1,-1,-1)
    const drawing = await generateAxonometricDrawing([front, behind], view());
    const ofBehind = drawing.lines.filter((l) => l.entityId === 2);
    assert.ok(ofBehind.length > 0, 'the covered box has lines');
    assert.ok(ofBehind.every(isHidden), 'every line of the covered box is classified hidden');
    assert.ok(drawing.lines.filter((l) => l.entityId === 1).every((l) => !isHidden(l)), 'the box in front stays visible');
    const sheet = asSheetDrawing(drawing);
    assert.equal(drawingAsViewShows(sheet, view()).lines.filter(isHidden).length, 0, 'omitted by default');
    assert.equal(drawingAsViewShows(sheet, view({ showHidden: true })).lines.filter(isHidden).length, ofBehind.length, 'kept (dashed by the pens) when asked');
  });

  it('hands the sheet a front-frame drawing (x right, y up), whatever the direction', async () => {
    for (const preset of ['se', 'sw', 'ne', 'nw'] as const) {
      const sheet = asSheetDrawing((await generateAxonometricDrawing([cube()], view({ preset }))));
      assert.equal(sheet.config.plane.axis, 'z', preset);
      assert.ok(sheet.config.plane.customPlane, 'the camera basis is kept');
    }
  });

  it('presets look from their corner towards the model at the isometric elevation', () => {
    const d = presetViewDirection('se');
    for (const v of [d.x, d.y, d.z]) assert.ok(Math.abs(v + 1 / Math.sqrt(3)) < 1e-12);
    assert.ok(presetViewDirection('nw').x > 0 && presetViewDirection('nw').z > 0, 'the NW camera looks south-east');
    const cam = axonometricCamera(view({ preset: 'sw' }));
    assert.ok(cam.target.x - cam.position.x > 0 && cam.target.z - cam.position.z < 0, 'the SW camera looks north-east');
  });

  it('a saved camera gives its own direction and up; a preset wins over it', () => {
    const saved = { position: { x: 5, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, fov: 45, projectionMode: 'orthographic' as const };
    const cam = axonometricCamera(view({ preset: undefined, viewpoint: saved }));
    assert.equal(cam.target.x - cam.position.x, -5);
    assert.equal(cam.up.z, 1);
    assert.equal(projectionOf(view({ projection: undefined, viewpoint: saved })), 'axonometric');
    assert.equal(projectionOf(view({ projection: undefined, viewpoint: { ...saved, projectionMode: 'perspective' } })), 'perspective');
    assert.equal(projectionOf(view({ projection: undefined, viewpoint: null })), 'perspective');
    assert.equal(axonometricCamera(view({ viewpoint: saved, preset: 'ne' })).up.y, 1);
  });
});
