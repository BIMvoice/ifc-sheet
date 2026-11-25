/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #831: a sheet's DXF in model units is the viewport as it reads on the paper, at true size about the drawing's origin, y up: a plan was
 * written mirrored about X, at (x, -y). The paper-units file is the sheet's millimetres with y flipped about the paper's height, as before.
 */

import { describe, expect, it } from 'vitest';
import { dxfEntities, dxfText } from './__fixtures__/dxf-text.js';
import type { SheetGraphic } from './sheet-graphic.js';

/**
 * A 1:50 viewport (20 mm of paper per metre) whose drawing's origin is at paper (100, 100): from the origin 1 m east (20 mm right),
 * then 2 m north (40 mm up the paper, so y falls), then a quarter circle of 1 m about (100, 60) turning left, north to west.
 */
const arc = Array.from({ length: 8 }, (_, i) => {
  const a = (Math.PI / 2) * ((i + 1) / 8);
  return { x: 100 + 20 * Math.cos(a), y: 60 - 20 * Math.sin(a) };
});
const path = [{ x: 100, y: 100 }, { x: 120, y: 100 }, { x: 120, y: 60 }, ...arc];
const sheet: SheetGraphic = {
  sheetId: 's', number: 'A-101', name: 'Plan', paper: { w: 420, h: 297 },
  frame: [[{ x: 5, y: 5 }, { x: 415, y: 5 }, { x: 415, y: 292 }, { x: 5, y: 292 }, { x: 5, y: 5 }]],
  fills: [], cut: [], lines: [],
  pens: [{ layer: 'CUT', stroke: '#000000', width: 0.5, fill: null, runs: [path], regions: [], frame: { x: 100, y: 100, s: 20 } }],
  symbols: { strokes: [], solids: [] }, marks: [], texts: [], images: [], underlays: [], viewports: [],
};

const cutPoints = (dxf: string) => dxfEntities(dxf).filter((e) => e.layer === 'CUT').flatMap((e) => e.points);
/** Twice the signed area of a run closed back to its start: positive when it turns left (counter-clockwise, y up). */
const turning = (pts: { x: number; y: number }[]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0);

describe('a sheet DXF in model units (#831)', () => {
  it('writes the viewport at its model coordinates, north up, not mirrored about X', () => {
    const pts = cutPoints(dxfText(sheet, { units: 'model' }));
    expect(pts[0].x).toBeCloseTo(0, 9);
    expect(pts[0].y).toBeCloseTo(0, 9);
    expect(pts[1].x).toBeCloseTo(1, 9);
    expect(pts[1].y).toBeCloseTo(0, 9);
    // Up the paper is north: +2 m, where the mirrored file had -2 m.
    expect(pts[2].x).toBeCloseTo(1, 9);
    expect(pts[2].y).toBeCloseTo(2, 9);
  });

  it('keeps the sense of every turn: an arc that turns left on the paper turns left in the model', () => {
    const paper = cutPoints(dxfText(sheet));
    const model = cutPoints(dxfText(sheet, { units: 'model' }));
    expect(Math.sign(turning(model))).toBe(Math.sign(turning(paper)));
    // And at true size: the paper's area over (20 mm per metre) squared.
    expect(turning(model)).toBeCloseTo(turning(paper) / 400, 3);
  });

  it('writes the paper-units file as before: the sheet\'s millimetres, y flipped about the paper\'s height', () => {
    const pts = cutPoints(dxfText(sheet));
    expect(pts.map((p) => [p.x, p.y])).toEqual(path.map((p) => [Number(p.x.toFixed(4)), Number((297 - p.y).toFixed(4))]));
  });
});
