/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #642: a building whose outline is open at a corner and in a wall still gets its strings outside it. The plan is a
 * 10 x 6 m house of 0.3 m walls with the south-west corner open (the west wall starts 0.2 m above the south wall) and a
 * 0.25 m gap in the north wall.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { Pt } from '../draft-types.js';
import { planDimensions } from './plan.js';
import { closingBoxes, closingTolerance } from './close.js';
import { boxOf, ringOfBox } from './outline.js';
import type { PlanPart } from './types.js';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => ringOfBox({ x0, y0, x1, y1 });
const wall = (id: number, ring: Pt[]): PlanPart => ({ id, kind: 'wall', rings: [ring] }) as PlanPart;

const house = (): PlanPart[] => [
  wall(1, box(0.5, 0, 10, 0.3)),
  wall(2, box(0.3, 5.7, 5, 6)),
  wall(3, box(5.25, 5.7, 10, 6)),
  wall(4, box(9.7, 0.3, 10, 5.7)),
  wall(5, box(0, 0.5, 0.3, 6)),
];

describe('closing the gaps of an outline (#642)', () => {
  it('closes a corner gap and a wall gap up to the wall thickness, and nothing wider', () => {
    const walls = house().map((p) => boxOf(p.rings[0]));
    const tol = closingTolerance(walls);
    assert.ok(tol >= 0.25 && tol <= 0.6);
    const closed = closingBoxes(walls);
    assert.ok(closed.some((b) => Math.abs(b.x0 - 5) < 1e-9 && Math.abs(b.x1 - 5.25) < 1e-9), 'the gap in the north wall');
    assert.ok(closed.some((b) => Math.abs(b.x0 - 0.3) < 1e-9 && Math.abs(b.x1 - 0.5) < 1e-9 && Math.abs(b.y0 - 0.3) < 1e-9 && Math.abs(b.y1 - 0.5) < 1e-9), 'the open corner');
    assert.deepEqual(closingBoxes(walls, 0.1), []);
  });

  it('puts every string outside a building with an open corner and a gap', () => {
    const parts = house().concat([{ id: 9, kind: 'door', rings: [box(2, 0, 3, 0.3)] } as PlanPart]);
    const plan = planDimensions(parts, { textHeight: 0.0025, paperUnit: 0.001 } as never);
    assert.ok(plan.strings.length > 0, 'strings are planned');
    const b = boxOf(plan.outline);
    assert.ok(Math.abs(b.x1 - b.x0 - 10) < 1e-6 && Math.abs(b.y1 - b.y0 - 6) < 1e-6, 'the outline is the whole building');
    for (const s of plan.strings) {
      for (const p of s.points) {
        const q = { x: p.x + s.outward.x * s.offset, y: p.y + s.outward.y * s.offset };
        assert.ok(q.x < b.x0 + 1e-6 || q.x > b.x1 - 1e-6 || q.y < b.y0 + 1e-6 || q.y > b.y1 - 1e-6, `${s.key} stands outside`);
      }
    }
    assert.equal(plan.droppedStrings, 0);
  });
});
