/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `hiddenBehindOthers` (#863): a line whose own-surface depth is not read must be one that every piece of it, at any
 * depth no nearer than the floor, would read hidden. Each case below is a way the shortcut could hide what the
 * classifier would show.
 */

import { describe, it, expect } from 'vitest';
import type { DrawingLine } from './types.js';
import { ownerKey, type DepthRaster } from './hidden-line-raster.js';
import { hiddenBehindOthers } from './hidden-line-own.js';

/** A 101 by 101 raster over 0..100, every pixel at depth 1 and owned by element 2. */
function raster(): DepthRaster {
  const width = 101, height = 101;
  return {
    buffer: new Float32Array(width * height).fill(1),
    owners: new Float64Array(width * height).fill(ownerKey(2, 0)),
    width, height, bounds: { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } },
  };
}

const line = (x0: number, y0: number, x1: number, y1: number): DrawingLine => ({
  line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcBeam', modelIndex: 0, depth: 5,
});

describe('hiddenBehindOthers (#863)', () => {
  it('is true for a line behind another element all along', () => {
    expect(hiddenBehindOthers(raster(), line(10.5, 20.2, 80.3, 60.7), 5, 0.001)).toBe(true);
  });

  it('is false when the floor is not behind the nearer surface by more than the bias', () => {
    expect(hiddenBehindOthers(raster(), line(10.5, 20.2, 80.3, 60.7), 1.0005, 0.001)).toBe(false);
  });

  it('is false when one pixel the line crosses lets it through', () => {
    const r = raster();
    // A pixel on the line's way, not at a sample: x = 50 on the line from (10, 30) to (90, 30) at y = 30.
    r.buffer[30 * r.width + 50] = Infinity;
    expect(hiddenBehindOthers(r, line(10, 30.4, 90, 30.4), 5, 0.001)).toBe(false);
  });

  it('is false when its own element shows in a pixel beside one it crosses', () => {
    const r = raster();
    r.owners[31 * r.width + 61] = ownerKey(1, 0);
    expect(hiddenBehindOthers(r, line(10, 30.4, 90, 30.4), 5, 0.001)).toBe(false);
  });

  it('is false for a line that reaches the raster edge, where a sample reads visible', () => {
    expect(hiddenBehindOthers(raster(), line(0, 30, 50, 30), 5, 0.001)).toBe(false);
  });

  it('reads the pixels of a diagonal line between its columns as well as at them', () => {
    const r = raster();
    // The steep line from (40.5, 10.5) to (41.5, 90.5) crosses rows 10 to 90 within two columns.
    r.buffer[70 * r.width + 41] = 0;
    expect(hiddenBehindOthers(r, line(40.5, 10.5, 41.5, 90.5), 5, 0.001)).toBe(true);
    r.buffer[70 * r.width + 41] = Infinity;
    expect(hiddenBehindOthers(r, line(40.5, 10.5, 41.5, 90.5), 5, 0.001)).toBe(false);
  });
});
