/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drawing ↔ world ↔ screen: drafted points land on the view's plane in 3D,
 * agree with drawing-2d's own projection, and round-trip through the
 * screen mapping for every cut axis.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectTo2D, projectTo2DBasis, type SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { drawingToUserPoint, userToDrawingPoint, drawingToScreen, drawingToWorld, screenToDrawing, userToDrawingVec, drawingToUserVec, worldToDrawing } from './frame.js';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

const planes: SectionPlaneConfig[] = [
  { axis: 'y', position: 4.2, flipped: false },
  { axis: 'z', position: -3, flipped: true },
  { axis: 'x', position: 7, flipped: false },
];

describe('drawingToWorld', () => {
  for (const plane of planes) {
    it(`puts the point on the ${plane.axis} plane and matches drawing-2d's projection (flipped=${plane.flipped})`, () => {
      const p = { x: 1.5, y: -2.25 };
      const w = drawingToWorld(plane, p);
      near(w[plane.axis], plane.position);
      const back = projectTo2D(w, plane.axis, plane.flipped);
      near(back.x, p.x);
      near(back.y, p.y);
      const again = worldToDrawing(plane, w);
      near(again.x, p.x);
      near(again.y, p.y);
    });
  }

  it('maps through a custom plane basis', () => {
    const s = Math.SQRT1_2;
    const plane: SectionPlaneConfig = {
      axis: 'z', position: 0, flipped: false,
      customPlane: { normal: { x: s, y: 0, z: s }, distance: 0, origin: { x: 1, y: 2, z: 3 }, tangent: { x: -s, y: 0, z: s }, bitangent: { x: 0, y: 1, z: 0 } },
    };
    const p = { x: 2, y: 5 };
    const w = drawingToWorld(plane, p);
    const back = projectTo2DBasis(w, plane.customPlane!.origin, plane.customPlane!.tangent, plane.customPlane!.bitangent);
    near(back.x, 2);
    near(back.y, 5);
  });
});

describe('screen mapping', () => {
  for (const axis of ['down', 'front', 'side'] as const) {
    it(`round-trips drawing ↔ screen on a ${axis} cut`, () => {
      const t = { x: 300, y: 200, scale: 40 };
      const p = { x: 3.25, y: -1.5 };
      const back = screenToDrawing(drawingToScreen(p, t, axis), t, axis);
      near(back.x, p.x);
      near(back.y, p.y);
    });

    it(`a user "up" vector points up on screen on a ${axis} cut`, () => {
      const t = { x: 0, y: 0, scale: 10 };
      const up = userToDrawingVec({ x: 0, y: 1 }, axis);
      const s = drawingToScreen(up, t, axis);
      assert.ok(s.y < 0, 'screen y decreases upward');
      const right = drawingToScreen(userToDrawingVec({ x: 1, y: 0 }, axis), t, axis);
      assert.ok(right.x > 0);
      const roundTrip = drawingToUserVec(up, axis);
      near(roundTrip.x, 0);
      near(roundTrip.y, 1);
    });
  }
});

describe('typed absolute points', () => {
  it('count from the origin given, and come back', () => {
    const origin = { x: 0, y: 297 };
    const p = userToDrawingPoint({ x: 20, y: 30 }, 'down', origin);
    near(p.x, 20); near(p.y, 267);
    const back = drawingToUserPoint(p, 'down', origin);
    near(back.x, 20); near(back.y, 30);
  });
});
