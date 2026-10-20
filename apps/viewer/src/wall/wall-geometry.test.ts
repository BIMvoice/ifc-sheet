/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { drawnQueue, mapToWall, miniMap, rectGap, scrollToCentre, visibleSheets, wallOverflows, type PlacedSheet } from './wall-geometry.js';

const sheet = (id: string, x: number, y: number, w = 100, h = 70): PlacedSheet => ({ id, rect: { x, y, w, h } });
const SCREEN = { x: 0, y: 0, w: 300, h: 200 };

describe('rectGap', () => {
  it('is 0 for overlapping and touching rectangles, else the straight gap', () => {
    assert.equal(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), 0);
    assert.equal(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), 0);
    assert.equal(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 0, w: 10, h: 10 }), 3);
    assert.equal(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 14, w: 10, h: 10 }), 5);
  });
});

describe('visibleSheets', () => {
  const wall = [sheet('far', 5000, 5000), sheet('edge', 350, 0), sheet('in', 10, 10), sheet('mid', 150, 100), sheet('below', 0, 420)];

  it('keeps the sheets on screen and within the margin, and leaves the rest out', () => {
    assert.deepEqual(visibleSheets(wall, SCREEN, 100).sort(), ['edge', 'in', 'mid']);
    assert.deepEqual(visibleSheets(wall, SCREEN, 20).sort(), ['in', 'mid']);
  });

  it('orders them nearest first: on screen by closeness to its middle, then by the gap', () => {
    assert.deepEqual(visibleSheets(wall, SCREEN, 300), ['mid', 'in', 'edge', 'below']);
  });

  it('keeps the Wall order between sheets that tie', () => {
    const twins = [sheet('a', 0, 0), sheet('b', 0, 0)];
    assert.deepEqual(visibleSheets(twins, SCREEN, 0), ['a', 'b']);
  });

  it('is empty for an empty Wall, and a 60-sheet Wall draws only those near the screen', () => {
    assert.deepEqual(visibleSheets([], SCREEN, 100), []);
    const sixty = Array.from({ length: 60 }, (_, i) => sheet(`s${i}`, (i % 10) * 380, Math.floor(i / 10) * 280, 340, 240));
    const near = visibleSheets(sixty, { x: 0, y: 0, w: 1100, h: 700 }, 550);
    assert.ok(near.length > 0 && near.length < 30, `${near.length} of 60`);
    assert.equal(near[0], 's11', 'the sheet whose middle is closest to the middle of the screen');
  });
});

describe('drawnQueue', () => {
  it('puts the near sheets first and keeps those drawn before behind them', () => {
    assert.deepEqual(drawnQueue(['a', 'b', 'c'], ['c', 'd']), ['c', 'd', 'a', 'b']);
    assert.deepEqual(drawnQueue([], ['x']), ['x']);
    assert.deepEqual(drawnQueue(['a'], []), ['a']);
  });
});

describe('scrollToCentre', () => {
  const view = { w: 400, h: 300 };
  const content = { w: 2000, h: 1500 };
  it('puts the point in the middle of the screen', () => {
    assert.deepEqual(scrollToCentre({ x: 1000, y: 800 }, view, content), { left: 800, top: 650 });
  });
  it('stays inside the Wall at its corners, and at 0 when the Wall is smaller than the screen', () => {
    assert.deepEqual(scrollToCentre({ x: 10, y: 10 }, view, content), { left: 0, top: 0 });
    assert.deepEqual(scrollToCentre({ x: 1990, y: 1490 }, view, content), { left: 1600, top: 1200 });
    assert.deepEqual(scrollToCentre({ x: 50, y: 50 }, view, { w: 100, h: 100 }), { left: 0, top: 0 });
  });
});

describe('wallOverflows', () => {
  it('is true only when the Wall is larger than the screen', () => {
    assert.equal(wallOverflows({ w: 400, h: 300 }, { w: 400, h: 300 }), false);
    assert.equal(wallOverflows({ w: 400, h: 300 }, { w: 401, h: 300 }), false, 'a pixel of rounding is not an overflow');
    assert.equal(wallOverflows({ w: 400, h: 300 }, { w: 900, h: 300 }), true);
    assert.equal(wallOverflows({ w: 400, h: 300 }, { w: 400, h: 900 }), true);
  });
});

describe('miniMap', () => {
  const sheets = [sheet('a', 0, 0, 200, 100), sheet('b', 1800, 1400, 200, 100)];
  const screen = { x: 600, y: 300, w: 400, h: 300 };

  it('fits the Wall in the box and scales the sheets and the screen the same', () => {
    const map = miniMap(sheets, screen, { w: 2000, h: 1500 }, { w: 200, h: 150 });
    assert.equal(map.k, 0.1);
    assert.deepEqual(map.size, { w: 200, h: 150 });
    assert.deepEqual(map.sheets[1].rect, { x: 180, y: 140, w: 20, h: 10 });
    assert.deepEqual(map.view, { x: 60, y: 30, w: 40, h: 30 });
  });

  it('is limited by the tighter side, and never enlarges a small Wall', () => {
    assert.equal(miniMap(sheets, screen, { w: 2000, h: 1500 }, { w: 200, h: 30 }).k, 0.02);
    assert.equal(miniMap(sheets, screen, { w: 100, h: 50 }, { w: 200, h: 150 }).k, 1);
  });

  it('maps a click on the map back to the same point of the Wall', () => {
    const map = miniMap(sheets, screen, { w: 2000, h: 1500 }, { w: 200, h: 150 });
    assert.deepEqual(mapToWall({ x: 100, y: 75 }, map), { x: 1000, y: 750 });
  });
});
