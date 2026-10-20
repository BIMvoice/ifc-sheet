/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planeBasis } from '@ifc-lite/renderer';
import { drawingToScreen } from '@/drafting/frame';
import { clearDepth, compassSide, interiorElevationViews, interiorPlane, onInteriorPlane, wallFaces, type WallFace } from './interior-elevations';
import { roomLabel } from './interior-room';

type P = { x: number; y: number };
const rect = (w: number, d: number): P[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }];
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('wallFaces', () => {
  it('gives one face per edge of a rectangle, the same whichever way the footprint runs', () => {
    const ccw = wallFaces(rect(4, 3));
    const cw = wallFaces([...rect(4, 3)].reverse());
    assert.equal(ccw.length, 4);
    const sides = (fs: WallFace[]) => fs.map((f) => compassSide(f.out)).sort();
    assert.deepEqual(sides(ccw), sides(cw));
    assert.deepEqual(sides(ccw), ['east', 'north', 'south', 'west']);
  });

  it('merges collinear edges and skips faces shorter than the minimum', () => {
    // Plan (x, z): a 4 x 3 room whose z = 0 edge is split in two, with a 0.2 m jog in its z = 3 edge.
    const ring = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 2.2, y: 3 }, { x: 2.2, y: 3.2 }, { x: 0, y: 3.2 }];
    const faces = wallFaces(ring);
    assert.equal(faces.length, 5, 'the split edge is one face, the 0.2 m jog none');
    assert.ok(faces.some((f) => close(f.length, 4)));
    assert.equal(wallFaces(ring, 0.1).length, 6);
  });

  it('orders a face left to right as seen from inside, looking at it', () => {
    // Plan (x, z), viewer frame: z = 0 is the north side (north is −z). Facing north, west (−x) is on the left.
    const north = wallFaces(rect(4, 3)).find((f) => compassSide(f.out) === 'north')!;
    assert.deepEqual([north.left.x, north.right.x], [0, 4]);
    const east = wallFaces(rect(4, 3)).find((f) => compassSide(f.out) === 'east')!;
    // Facing east, north (z = 0) is on the left.
    assert.deepEqual([east.left.y, east.right.y], [0, 3]);
  });
});

describe('compassSide', () => {
  it('names the quadrant of the outward direction against project north (viewer −z)', () => {
    const at = (deg: number) => compassSide({ x: Math.sin((deg * Math.PI) / 180), y: -Math.cos((deg * Math.PI) / 180) });
    assert.deepEqual([0, 30, -30, 44, 46, 90, 134, 136, 180, -136, -90, -46].map(at),
      ['north', 'north', 'north', 'north', 'east', 'east', 'east', 'south', 'south', 'south', 'west', 'west']);
  });
});

describe('interiorPlane', () => {
  for (const deg of [0, 30, 60, 90, 135, 200, 300]) {
    it(`at ${deg} degrees: the renderer's basis, upright, and the wall's left end on the left of the paper`, () => {
      const r = (deg * Math.PI) / 180;
      const out = { x: Math.sin(r), y: -Math.cos(r) };
      const right = { x: -out.y, y: out.x };
      const face: WallFace = { left: { x: 5 - right.x * 2, y: 5 - right.y * 2 }, right: { x: 5 + right.x * 2, y: 5 + right.y * 2 }, out, length: 4 };
      const plane = interiorPlane(face, 3);
      const c = plane.custom!;
      const basis = planeBasis(c.normal);
      assert.deepEqual([c.tangent, c.bitangent], [basis.tangent, basis.bitangent]);
      assert.ok(close(c.bitangent[1], 1), 'drawing y is up');
      // The plane sits 3 m into the room, looking at the face: the face is on its kept side, the room centre behind.
      const signed = (p: [number, number, number]) => (p[0] * c.normal[0] + p[2] * c.normal[2] - c.distance) * (plane.flipped ? -1 : 1);
      assert.ok(signed([5, 0, 5]) < 0, 'the wall is in front of the plane');
      assert.ok(signed([5 - out.x * 4, 0, 5 - out.y * 4]) > 0, 'the far side of the room is behind it');
      // On paper (the sheet's and canvas's sign for the plane's axis) the left end is left of the right end.
      const axis = plane.axis === 'side' ? 'side' : 'front';
      const paper = (p: P) => drawingToScreen(onInteriorPlane(plane, p, 0), { x: 0, y: 0, scale: 1 }, axis).x;
      assert.ok(paper(face.left) < paper(face.right));
      assert.ok(close(Math.abs(paper(face.right) - paper(face.left)), 4, 1e-9));
    });
  }
});

describe('clearDepth', () => {
  it('is the depth of the room straight ahead of the face, the shallowest across its width', () => {
    // An L: 6 wide along z = 0, 4 deep on its left half, 2 deep on its right half.
    const ring = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 0, y: 4 }];
    const north = wallFaces(ring).find((f) => close(f.length, 6))!;
    assert.ok(close(clearDepth(ring, north), 2));
    const rectNorth = wallFaces(rect(4, 3)).find((f) => compassSide(f.out) === 'north')!;
    assert.ok(close(clearDepth(rect(4, 3), rectNorth), 3));
  });
});

describe('interiorElevationViews', () => {
  it('names the views after the room and the side, numbering a side with several walls, clockwise from north', () => {
    // An L whose south-east corner is cut away: two walls face east and two face south.
    const ring = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 0, y: 4 }];
    const views = interiorElevationViews({ guid: 'G', label: '6 Küche', ring, floor: 0, top: 2.5 });
    assert.deepEqual(views.map((v) => v.name.replace('6 Küche – ', '')), ['North', 'East 1', 'East 2', 'South 1', 'South 2', 'West']);
    for (const v of views) {
      assert.equal(v.interior.room, 'G');
      assert.deepEqual([v.interior.crop.min.y, v.interior.crop.max.y], [0, 2.5]);
      assert.ok(v.viewDepth! > 0.3);
    }
  });
});

describe('roomLabel', () => {
  it('joins number and name, else uses whichever there is', () => {
    assert.equal(roomLabel('4', 'Schlafzimmer', 'Room 1'), '4 Schlafzimmer');
    assert.equal(roomLabel('', 'Bad', 'Room 1'), 'Bad');
    assert.equal(roomLabel(undefined, undefined, 'Room 1'), 'Room 1');
  });
});
