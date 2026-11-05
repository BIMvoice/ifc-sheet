/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { grid } from './__fixtures__/contour-grid.js';
import { CONTOUR_MAJOR_EVERY, MAX_CONTOUR_LEVELS, contourLevels, contourLines } from './contours.js';

describe('contourLevels (#182)', () => {
  it('are the multiples of the interval inside the range, every fifth major', () => {
    const levels = contourLevels(0.03, 1.93, 0.1);
    expect(levels).toHaveLength(19);
    expect(levels.filter((l) => l.major).map((l) => l.height)).toEqual([0.5, 1, 1.5]);
    expect(CONTOUR_MAJOR_EVERY).toBe(5);
  });

  it('are bounded: a hairline interval is coarsened, a bad one gives none', () => {
    expect(contourLevels(0, 1000, 0.0001).length).toBeLessThanOrEqual(MAX_CONTOUR_LEVELS);
    expect(contourLevels(0, 10, 0)).toEqual([]);
    expect(contourLevels(0, 10, -1)).toEqual([]);
    expect(contourLevels(5, 1, 1)).toEqual([]);
  });
});

describe('contourLines (#182)', () => {
  const plane = grid(19, 10, (x) => 0.1 * x + 0.03);

  it('cuts a tilted plane into one straight open line per level, at the level and across the whole width', () => {
    const lines = contourLines([plane], 0.5);
    expect(lines.map((l) => l.height)).toEqual([0.5, 1, 1.5]);
    for (const l of lines) {
      expect(l.closed).toBe(false);
      expect(l.points.length).toBeGreaterThanOrEqual(11);
      // y = 0.1x + 0.03: a contour of height h is the line x = (h - 0.03) / 0.1.
      for (const p of l.points) expect(p.x).toBeCloseTo((l.height - 0.03) / 0.1, 3);
      expect(Math.min(...l.points.map((p) => p.z))).toBeCloseTo(0, 6);
      expect(Math.max(...l.points.map((p) => p.z))).toBeCloseTo(10, 6);
    }
  });

  it('changing the interval changes the count, and marks every fifth level major', () => {
    const fine = contourLines([plane], 0.1);
    expect(fine).toHaveLength(19);
    expect(fine.filter((l) => l.major).map((l) => l.height)).toEqual([0.5, 1, 1.5]);
    expect(contourLines([plane], 0.25)).toHaveLength(7);
  });

  it('closes the contours round a cone and leaves open the ones that run off the surface', () => {
    const cone = grid(20, 20, (x, z) => 9.5 - Math.hypot(x - 10, z - 10));
    const lines = contourLines([cone], 2);
    const closed = lines.filter((l) => l.closed);
    expect(closed.map((l) => l.height)).toEqual([0, 2, 4, 6, 8]);
    for (const l of closed) for (const p of l.points) expect(Math.hypot(p.x - 10, p.z - 10)).toBeCloseTo(9.5 - l.height, 0);
    // The levels below 0 reach past the square's sides: four arcs each, none closed.
    expect(lines.filter((l) => !l.closed).map((l) => l.height)).toEqual([-4, -4, -4, -4, -2, -2, -2, -2]);
  });

  it('reads heights and positions with the mesh origin, and heights with the datum', () => {
    const lifted = grid(19, 10, (x) => 0.1 * x + 0.03, [100, 50, -20]);
    const lines = contourLines([lifted], 0.5, 0);
    expect(lines[0].height).toBeCloseTo(50.5, 6);
    expect(lines[0].points[0].x).toBeCloseTo(100 + (0.5 - 0.03) / 0.1, 3);
    expect(lines[0].points.map((p) => p.z).sort((a, b) => a - b)[0]).toBeCloseTo(-20, 3);
    // A datum shifts the levels, not the plan position.
    expect(contourLines([plane], 0.5, 0.25).map((l) => l.height)).toEqual([0.5, 1, 1.5, 2]);
  });

  it('skips a triangle that names a vertex the mesh lacks, and a flat surface', () => {
    expect(contourLines([{ ...grid(1, 1, () => 0), indices: new Uint32Array([0, 1, 9]) }], 0.5)).toEqual([]);
    expect(contourLines([grid(3, 3, () => 2)], 0.5)).toEqual([]);
  });
});
