/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The perimeter column of the room schedule (#42): the outline of the footprint the area falls back on, measured from the
 * geometry and not from its bounding box, and the table as numbers for the one CSV and XLSX writer.
 */

import { describe, expect, it } from 'vitest';
import { meshFootprintArea, meshFootprintPerimeter, type FootprintMesh } from './room-areas.js';
import { ROOM_SCHEDULE_EN, roomSchedule, roomScheduleTable, roomScheduleText, type RoomRecord } from './room-schedule.js';

type Ring = readonly (readonly [number, number])[];

/** The triangles (corner indices) of a simple polygon given counter-clockwise, by ear clipping. */
function earClip(ring: Ring): [number, number, number][] {
  const cross = (a: number, b: number, c: number) => (ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[c][0] - ring[a][0]) * (ring[b][1] - ring[a][1]);
  const inside = (p: number, a: number, b: number, c: number) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const left = ring.map((_, i) => i);
  const out: [number, number, number][] = [];
  while (left.length > 3) {
    const k = left.findIndex((_, i) => {
      const [a, b, c] = [left[(i + left.length - 1) % left.length], left[i], left[(i + 1) % left.length]];
      return cross(a, b, c) > 0 && !left.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c));
    });
    const [a, b, c] = [left[(k + left.length - 1) % left.length], left[k], left[(k + 1) % left.length]];
    out.push([a, b, c]);
    left.splice(k, 1);
  }
  out.push([left[0], left[1], left[2]]);
  return out;
}

/**
 * A prism over the counter-clockwise polygon `ring` (metres, plan x and y; the viewer frame's x and z), floor at height 0 and
 * `height` high: the faces of an extruded room, the top and the bottom triangulated differently from the sides.
 */
function prism(ring: Ring, height: number, options: { flipBottom?: boolean; roofSlope?: number } = {}): FootprintMesh {
  const n = ring.length;
  const positions: number[] = [];
  for (const [x, z] of ring) positions.push(x, 0, z);
  for (const [x, z] of ring) positions.push(x, height + (options.roofSlope ?? 0) * x, z);
  const indices: number[] = [];
  for (const [a, b, c] of earClip(ring)) {
    indices.push(a, c, b);
    indices.push(n + a, n + b, n + c);
  }
  if (options.flipBottom) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j, i, n + j, n + i);
  }
  return { positions, indices };
}
const boxPerimeter = (ring: Ring): number => {
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  return 2 * (Math.max(...xs) - Math.min(...xs) + Math.max(...zs) - Math.min(...zs));
};

describe('a room\'s perimeter from its footprint', () => {
  const BAD: [number, number][] = [[0, 0], [3.71, 0], [3.71, 3.37], [0, 3.37]];
  // An L: 6 x 4 with a 3 x 2 corner taken out. Its outline is 20 m, and so is its bounding box's here; the next one is not.
  const L: [number, number][] = [[0, 0], [6, 0], [6, 2], [3, 2], [3, 4], [0, 4]];
  // A room with a diagonal wall: a right trapezoid.
  const TRAPEZE: [number, number][] = [[0, 0], [8, 0], [5, 3], [0, 3]];
  // A U: 6 x 5 with a 2 x 3 notch cut from the top edge, so the outline is longer than the box's.
  const U: [number, number][] = [[0, 0], [6, 0], [6, 5], [4, 5], [4, 2], [2, 2], [2, 5], [0, 5]];

  it('is the length of the outline, as the area is the footprint\'s: a plain box (the hand sum of its sides)', () => {
    expect(meshFootprintPerimeter([prism(BAD, 2.5)])).toBeCloseTo(2 * (3.71 + 3.37), 9);
    expect(meshFootprintArea([prism(BAD, 2.5)])).toBeCloseTo(3.71 * 3.37, 9);
  });

  it('follows a notch and a diagonal wall, where the bounding box would be wrong', () => {
    expect(meshFootprintPerimeter([prism(U, 2.6)])).toBeCloseTo(6 + 5 + 2 + 3 + 2 + 3 + 2 + 5, 9);
    expect(boxPerimeter(U)).toBe(22);
    expect(meshFootprintPerimeter([prism(U, 2.6)])).not.toBeCloseTo(boxPerimeter(U), 3);
    expect(meshFootprintPerimeter([prism(TRAPEZE, 2.6)])).toBeCloseTo(8 + 5 + Math.hypot(3, 3) + 3, 9);
    expect(meshFootprintPerimeter([prism(L, 2.6)])).toBeCloseTo(6 + 2 + 3 + 2 + 3 + 4, 9);
  });

  it('does not depend on the winding of the faces or on a sloped ceiling', () => {
    expect(meshFootprintPerimeter([prism(U, 2.6, { flipBottom: true })])).toBeCloseTo(28, 9);
    // Every face turned inside out.
    const inverted = prism(U, 2.6);
    for (let i = 0; i < inverted.indices.length; i += 3) [(inverted.indices as number[])[i + 1], (inverted.indices as number[])[i + 2]] = [inverted.indices[i + 2], inverted.indices[i + 1]];
    expect(meshFootprintPerimeter([inverted])).toBeCloseTo(28, 9);
    // The ceiling follows the roof: the top faces are not horizontal, the outline on the plan is the same.
    expect(meshFootprintPerimeter([prism(L, 2.6, { roofSlope: 0.4 })])).toBeCloseTo(20, 9);
  });

  it('counts a wall once when the ceiling has corners on its line that the floor has not (a groove, #42)', () => {
    // A 4 x 3 floor of two triangles; the ceiling of four, with corners halfway along both long walls.
    const positions = [0, 0, 0, 4, 0, 0, 4, 0, 3, 0, 0, 3, /* ceiling */ 0, 2.5, 0, 2, 2.5, 0, 4, 2.5, 0, 4, 2.5, 3, 2, 2.5, 3, 0, 2.5, 3];
    const indices = [0, 2, 1, 0, 3, 2, 4, 5, 8, 4, 8, 9, 5, 6, 7, 5, 7, 8];
    expect(meshFootprintPerimeter([{ positions, indices }])).toBeCloseTo(14, 9);
  });

  it('adds up the pieces of one room and is zero without geometry', () => {
    const left: [number, number][] = [[0, 0], [2, 0], [2, 3], [0, 3]];
    const right: [number, number][] = [[2, 0], [5, 0], [5, 3], [2, 3]];
    // Two prisms sharing a wall: the pieces' outline is that of the whole (the shared wall is inside).
    expect(meshFootprintPerimeter([prism(left, 2.5), prism(right, 2.5)])).toBeCloseTo(2 * (5 + 3), 9);
    expect(meshFootprintPerimeter([])).toBe(0);
  });
});

describe('the room schedule as a table for the one writer', () => {
  const room = (id: string, name: string, area: number | null, perimeter: number | null): RoomRecord => ({ id, number: id, name, level: 0, area, source: area === null ? null : 'quantity', perimeter });
  const schedule = roomSchedule([{ name: 'Ground', elevation: 0 }], [room('1', 'Bad', 12.127619, 14.16), room('2', 'Loft', null, null)]);

  it('keeps areas and perimeters as numbers, with their kinds, and no perimeter on a total', () => {
    const table = roomScheduleTable(schedule, ROOM_SCHEDULE_EN);
    expect(table.header).toEqual(['No.', 'Room', 'Level', 'Useful area m²', 'Perimeter m']);
    expect(table.rows).toContainEqual(['1', 'Bad', 'Ground', 12.127619, 14.16]);
    expect(table.rows).toContainEqual(['2', 'Loft', 'Ground', null, null]);
    expect(table.rows.at(-1)).toEqual(['', 'Total building (Au)', '', 12.127619, null]);
    expect(table.kinds).toEqual({ 3: 'area', 4: 'length' });
    expect(table.bold).toEqual([0, 3, 4]);
    for (const row of table.rows) for (const c of [3, 4]) expect(typeof row[c] === 'number' || row[c] === null).toBe(true);
  });

  it('prints the perimeter in the text, in the language\'s decimal mark', () => {
    expect(roomScheduleText(schedule, 'en')).toMatch(/Bad\s+Ground\s+12\.13\s+14\.16/);
    expect(roomScheduleText(schedule, 'ro')).toMatch(/Bad\s+Ground\s+12,13\s+14,16/);
  });
});
