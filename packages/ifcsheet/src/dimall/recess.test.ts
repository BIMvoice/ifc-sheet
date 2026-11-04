/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #642: a balcony behind a parapet. The 12 x 8 m block has a recess 0.8 m deep in its north face between x = 3 and x = 9.
 * The balcony wall at the back of it carries a window, and its finish (a 25 mm coat standing 25 mm clear of the wall) is
 * an element of its own, so the window lies 0.05 m behind the facade the outline draws. The recess is part of the outside:
 * its facade gets its string, standing beyond the building.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { Pt } from '../draft-types.js';
import { planDimensions } from './plan.js';
import { ringOfBox } from './outline.js';
import type { PlanPart } from './types.js';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => ringOfBox({ x0, y0, x1, y1 });
const wall = (id: number, ring: Pt[]): PlanPart => ({ id, kind: 'wall', rings: [ring] }) as PlanPart;

const block = (): PlanPart[] => [
  wall(1, box(0, 0, 12, 0.3)),
  wall(2, box(11.7, 0.3, 12, 7.7)),
  wall(3, box(0, 0.3, 0.3, 7.7)),
  wall(4, box(0, 7.7, 3, 8)),
  wall(5, box(9, 7.7, 12, 8)),
  // The recess: returns, the balcony wall behind it, and its finish.
  wall(6, box(2.7, 7.15, 3, 7.7)),
  wall(7, box(9, 7.15, 9.3, 7.7)),
  wall(8, box(2.7, 6.9, 9.3, 7.15)),
  wall(9, box(3, 7.175, 9, 7.2)),
  { id: 10, kind: 'window', rings: [box(4, 6.9, 5.5, 7.15)] } as PlanPart,
];

describe('a balcony recess behind a parapet (#642)', () => {
  it('gets a string on its facade, outside the building', () => {
    const plan = planDimensions(block(), { textHeight: 0.25, paperUnit: 0.1 });
    const onRecess = plan.strings.filter((s) => s.kind === 'overall' && Math.abs(s.outward.y - 1) < 1e-9 && Math.abs(s.points[0].y - 7.2) < 0.01);
    assert.equal(onRecess.length, 1, `strings: ${plan.strings.map((s) => s.key).join()}`);
    const [a, b] = onRecess[0].points;
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 6) < 1e-6, 'the width between the returns');
    assert.ok(onRecess[0].points[0].y + onRecess[0].offset > 8, 'the string stands beyond the north face');
    assert.equal(plan.droppedStrings, 0);
  });
});
