/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #642: gaps in a building's walls wider than a wall, that something else the plan cuts stands in. On rvt01 the boards of
 * a column's casing (IfcCovering) fill the corners and the steps of the facade; on the IfcOpenHouse the mullions and panes
 * of its windows (IfcMember, IfcPlate) turn the south-west corner; on rvt01's ground floor a door stands against a corner
 * with no wall above it. Each plan is a 10 x 6 m house of 0.2 m walls; the outline must be the whole of it and every
 * string must stand outside it. An empty gap that wide stays open (#715's limit).
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { Pt } from '../draft-types.js';
import { kindOfClass } from './parts.js';
import { planDimensions } from './plan.js';
import { boxOf, ringOfBox } from './outline.js';
import type { DimensionPlan, PartKind, PlanPart } from './types.js';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => ringOfBox({ x0, y0, x1, y1 });
let next = 1;
const part = (kind: PartKind, ...rings: Pt[][]): PlanPart => ({ id: next++, kind, rings });
/** A column's casing: four boards 12 mm thick round the column, each cut as its own outline. */
const casing = (x0: number, y0: number, x1: number, y1: number, t = 0.012): PlanPart =>
  part('filler', box(x0, y0, x1, y0 + t), box(x0, y1 - t, x1, y1), box(x0, y0 + t, x0 + t, y1 - t), box(x1 - t, y0 + t, x1, y1 - t));

const plan = (parts: PlanPart[]): DimensionPlan => planDimensions(parts, { textHeight: 0.0025, paperUnit: 0.001 });
const area = (loop: readonly Pt[]) => Math.abs(loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

/** Every point of every string, moved out to its line, lies outside the outline's box or on its edge. */
function assertOutside(p: DimensionPlan): void {
  const b = boxOf(p.outline);
  for (const s of p.strings) {
    for (const pt of s.points) {
      const q = { x: pt.x + s.outward.x * s.offset, y: pt.y + s.outward.y * s.offset };
      assert.ok(q.x < b.x0 + 1e-6 || q.x > b.x1 - 1e-6 || q.y < b.y0 + 1e-6 || q.y > b.y1 - 1e-6, `${s.key} stands outside`);
    }
  }
}

/** The house with its north wall broken from x 4.4 to 5.0, a gap three walls wide; a door in the south wall. */
const brokenNorth = (): PlanPart[] => [
  part('wall', box(0, 0, 10, 0.2)),
  part('wall', box(9.8, 0.2, 10, 5.8)),
  part('wall', box(5, 5.8, 10, 6)),
  part('wall', box(0, 5.8, 4.4, 6)),
  part('wall', box(0, 0.2, 0.2, 5.8)),
  part('door', box(2, 0.07, 3, 0.13)),
];

describe('a gap something stands in is closed, an empty one is not (#642)', () => {
  it('closes a gap three walls wide that a column casing fills', () => {
    const p = plan([...brokenNorth(), casing(4.4, 5.8, 5, 6)]);
    assert.ok(Math.abs(area(p.outline) - 60) < 1e-6, `the outline is the whole house: ${area(p.outline)}`);
    assert.equal(p.droppedStrings, 0);
    assertOutside(p);
  });

  it('leaves it open when it is empty, or when only the plaster of the wall beside it runs past it', () => {
    for (const extra of [[], [part('filler', box(4.4, 5.785, 5, 5.8))]]) {
      const p = plan([...brokenNorth(), ...extra]);
      assert.ok(area(p.outline) < 30, `the outline leaks through the gap: ${area(p.outline)}`);
    }
  });

  it('turns a glazed corner the windows fill, mullions and panes, metres wide (the IfcOpenHouse)', () => {
    const mullion = (x: number, y: number) => part('filler', box(x - 0.05, y - 0.05, x + 0.05, y + 0.05));
    const parts = [
      part('wall', box(3, 0, 10, 0.2)),
      part('wall', box(9.8, 0.2, 10, 5.8)),
      part('wall', box(0, 5.8, 10, 6)),
      part('wall', box(0, 2, 0.2, 5.8)),
      part('door', box(9.87, 2, 9.93, 3)),
      mullion(0.1, 0.1), mullion(2.95, 0.1), mullion(0.1, 1.95),
      part('filler', box(0.15, 0.09, 2.9, 0.11)),
      part('filler', box(0.09, 0.15, 0.11, 1.9)),
    ];
    const p = plan(parts);
    assert.ok(Math.abs(area(p.outline) - 60) < 1e-6, `the outline is the whole house: ${area(p.outline)}`);
    assert.equal(p.droppedStrings, 0);
    assertOutside(p);
    const overall = p.strings.filter((s) => s.kind === 'overall').map((s) => Math.hypot(s.points[1].x - s.points[0].x, s.points[1].y - s.points[0].y));
    assert.deepEqual(overall.map((v) => v.toFixed(2)), ['6.00'], 'the east facade, and no string between the inner faces');
    // Without the glazing the corner is open, and the outline runs into the room.
    assert.ok(area(plan(parts.filter((q) => q.kind !== 'filler')).outline) < 30);
  });

  it('closes a step in the facade that a column casing stands in', () => {
    const parts = [
      part('wall', box(0, 0, 10, 0.2)),
      part('wall', box(9.8, 0.2, 10, 5.3)),
      part('wall', box(5.3, 5.3, 10, 5.5)),
      part('wall', box(0, 5.8, 5, 6)),
      part('wall', box(0, 0.2, 0.2, 5.8)),
      part('door', box(2, 0.07, 3, 0.13)),
      casing(5, 5.3, 5.3, 6),
    ];
    const p = plan(parts);
    assert.ok(Math.abs(area(p.outline) - (5.3 * 6 + 4.7 * 5.5)) < 1e-6, `the outline is the whole house: ${area(p.outline)}`);
    assert.equal(p.droppedStrings, 0);
    assertOutside(p);
    assert.ok(area(plan(parts.slice(0, -1)).outline) < 30, 'without the casing the step is open');
  });

  it('closes the corner a door leaves where it stands against a wall with none above it (rvt01, ground floor)', () => {
    const parts = [
      part('wall', box(0, 0, 10, 0.2)),
      part('wall', box(9.8, 0.2, 10, 5.1)),
      part('wall', box(0.25, 5.1, 10, 5.3)),
      part('wall', box(0, 0.2, 0.2, 4)),
      part('door', box(0.07, 4, 0.13, 5)),
      part('door', box(5, 0.07, 6, 0.13)),
    ];
    const p = plan(parts);
    assert.ok(area(p.outline) > 52.9, `the outline is the whole house: ${area(p.outline)}`);
    assert.equal(p.droppedStrings, 0);
    assertOutside(p);
  });

  it('reads columns, coverings, members and plates as fillers, and their types as nothing', () => {
    assert.deepEqual(['IFCCOLUMN', 'IFCCOVERING', 'IFCMEMBER', 'IFCPLATE', 'IFCCOVERINGTYPE', 'IFCMEMBERTYPE'].map(kindOfClass), ['filler', 'filler', 'filler', 'filler', null, null]);
  });
});
