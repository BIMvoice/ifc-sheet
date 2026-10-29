/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { ProjectView } from './document.js';
import { barHalfMetres, markArea, markBox, northDegrees, viewportMarkFlags, viewportMarks, ARROW_HALF_MM } from './viewport-marks.js';
import { sheetFormat } from './units-and-numbers.js';

const AREA = { x: 10, y: 10, w: 700, h: 500 };
const PLAN = { axis: 'y' } as const;
const toward = (deg: number) => ({ x: -Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180) });

/** The width of the scale bar's outline: its first stroke, a closed rectangle. */
const barLength = (strokes: readonly (readonly { x: number }[])[]): number => {
  const xs = strokes[0].map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
};

describe('the angle of a north arrow on a plan', () => {
  it('is 0 for project north and the counter-clockwise angle of the TrueNorth otherwise', () => {
    expect(northDegrees(PLAN, null)).toBe(0);
    expect(northDegrees(PLAN, { x: 0, y: 1 })).toBe(0);
    expect(northDegrees(PLAN, toward(30))).toBeCloseTo(30, 9);
    expect(northDegrees(PLAN, toward(-50))).toBeCloseTo(-50, 9);
    expect(northDegrees(PLAN, { x: 1, y: 0 })).toBeCloseTo(-90, 9);
    expect(Math.abs(northDegrees(PLAN, { x: 0, y: -1 }) ?? 0)).toBeCloseTo(180, 9);
  });

  it('mirrors on a reflected plan, and is none off a cardinal plan', () => {
    expect(northDegrees({ axis: 'y', flipped: true }, toward(30))).toBeCloseTo(-30, 9);
    expect(northDegrees({ axis: 'z' }, toward(30))).toBeNull();
    expect(northDegrees({ axis: 'x' }, toward(30))).toBeNull();
    expect(northDegrees({ axis: 'y', customPlane: {} }, toward(30))).toBeNull();
  });
});

describe('the graphic scale bar', () => {
  it('spans 0-5-10 m at 1:100 and 0-25-50 m at 1:500, 100 mm of paper either way', () => {
    for (const [scale, labels] of [[100, ['0', '5', '10 m']], [500, ['0', '25', '50 m']]] as const) {
      const { strokes, solids, texts } = viewportMarks({ area: AREA, scale, arrowDegrees: null, bar: true, locale: 'en' });
      expect(barLength(strokes)).toBeCloseTo(100, 9);
      // The filled half is the first segment: half the bar.
      expect(Math.max(...solids[0].map((p) => p.x)) - Math.min(...solids[0].map((p) => p.x))).toBeCloseTo(50, 9);
      expect(texts.map((t) => t.text)).toEqual(labels);
    }
  });

  it('follows the scale: 1:50 reads 0-2.5-5 m (50 mm), 1:200 reads 0-10-20 m (100 mm)', () => {
    const at = (scale: number) => viewportMarks({ area: AREA, scale, arrowDegrees: null, bar: true, locale: 'en' });
    expect(at(50).texts.map((t) => t.text)).toEqual(['0', '2.5', '5 m']);
    expect(barLength(at(50).strokes)).toBeCloseTo(100, 9);
    expect(at(200).texts.map((t) => t.text)).toEqual(['0', '10', '20 m']);
    expect(barLength(at(200).strokes)).toBeCloseTo(100, 9);
  });

  it('writes its figures in the project\'s number format: commas in a comma project', () => {
    const comma = sheetFormat('en', { separator: 'comma' });
    expect(viewportMarks({ area: AREA, scale: 50, arrowDegrees: null, bar: true, locale: comma }).texts.map((t) => t.text)).toEqual(['0', '2,5', '5 m']);
    expect(viewportMarks({ area: AREA, scale: 50, arrowDegrees: null, bar: true, locale: 'ro' }).texts.map((t) => t.text)).toEqual(['0', '2,5', '5 m']);
    expect(viewportMarks({ area: AREA, scale: 50, arrowDegrees: null, bar: true, locale: sheetFormat('ro', { separator: 'point' }) }).texts.map((t) => t.text)).toEqual(['0', '2.5', '5 m']);
  });

  it('is shorter in a smaller box and left out when even the shortest does not fit', () => {
    expect(barLength(viewportMarks({ area: { x: 0, y: 0, w: 120, h: 80 }, scale: 100, arrowDegrees: null, bar: true, locale: 'en' }).strokes)).toBeCloseTo(50, 9);
    expect(viewportMarks({ area: { x: 0, y: 0, w: 30, h: 80 }, scale: 100, arrowDegrees: null, bar: true, locale: 'en' }).strokes).toEqual([]);
    expect(barHalfMetres(100, 100)).toBe(5);
    expect(barHalfMetres(500, 100)).toBe(25);
    expect(barHalfMetres(0, 100)).toBeNull();
  });

  it('stands in the bottom-left corner of the box, clear of its edges', () => {
    const { strokes, texts } = viewportMarks({ area: AREA, scale: 100, arrowDegrees: null, bar: true, locale: 'en' });
    const pts = strokes.flat();
    expect(Math.min(...pts.map((p) => p.x))).toBeGreaterThanOrEqual(AREA.x + 4);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(AREA.y + AREA.h - 4, 9);
    for (const t of texts) expect(t.at.y).toBeLessThan(AREA.y + AREA.h - 4);
  });
});

describe('the north arrow', () => {
  it('points where it is told, from the corner it stands in', () => {
    for (const deg of [0, 30, -50, 135]) {
      const { strokes, texts } = viewportMarks({ area: AREA, scale: 100, arrowDegrees: deg, bar: false, locale: 'en' });
      const [tip, notch] = strokes[1];
      // Counter-clockwise from the paper's up; the paper's y runs down.
      expect((Math.atan2(-(tip.x - notch.x), -(tip.y - notch.y)) * 180) / Math.PI).toBeCloseTo(deg, 9);
      expect(texts.map((t) => t.text)).toEqual(['N']);
    }
  });

  it('sits in the top-right corner of the box and keeps inside it', () => {
    const { strokes, texts } = viewportMarks({ area: AREA, scale: 100, arrowDegrees: 0, bar: false, locale: 'en' });
    const pts = [...strokes.flat(), ...texts.map((t) => t.at)];
    expect(Math.max(...pts.map((p) => p.x))).toBeLessThanOrEqual(AREA.x + AREA.w - 4);
    expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(AREA.y + 4);
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(AREA.x + AREA.w - 4 - 2 * ARROW_HALF_MM);
  });

  it('is not drawn when the box is too small for it', () => {
    expect(viewportMarks({ area: { x: 0, y: 0, w: 20, h: 20 }, scale: 100, arrowDegrees: 0, bar: false, locale: 'en' }).strokes).toEqual([]);
  });

  it('shares the box with the bar without meeting it, however narrow', () => {
    const { strokes, texts } = viewportMarks({ area: { x: 0, y: 0, w: 60, h: 40 }, scale: 100, arrowDegrees: 0, bar: true, locale: 'en' });
    const arrowX = Math.min(...strokes[0].map((p) => p.x));
    const barX = Math.max(...strokes[2].map((p) => p.x), ...texts.filter((t) => t.text !== 'N').map((t) => t.at.x + 5));
    expect(barX).toBeLessThan(arrowX);
  });
});

const view = (over: Record<string, unknown>): ProjectView => ({ id: 'v', name: 'V', createdAt: 0, ...over }) as unknown as ProjectView;

describe('which marks a viewport shows', () => {
  const none = {};
  it('are off unless asked, except on a site plan, which carries both unless it says otherwise', () => {
    expect(viewportMarkFlags(none, view({ kind: 'plan' }))).toEqual({ northArrow: false, scaleBar: false });
    expect(viewportMarkFlags(none, view({ kind: 'plan', site: true }))).toEqual({ northArrow: true, scaleBar: true });
    expect(viewportMarkFlags({ northArrow: false, scaleBar: false }, view({ kind: 'plan', site: true }))).toEqual({ northArrow: false, scaleBar: false });
    expect(viewportMarkFlags({ northArrow: true, scaleBar: true }, view({ kind: 'plan' }))).toEqual({ northArrow: true, scaleBar: true });
  });

  it('a north arrow is for plans only, a scale bar for a drawing with a scale, neither for a key plan', () => {
    expect(viewportMarkFlags({ northArrow: true, scaleBar: true }, view({ kind: 'section' }))).toEqual({ northArrow: false, scaleBar: true });
    expect(viewportMarkFlags({ northArrow: true, scaleBar: true }, view({ kind: '3d' }))).toEqual({ northArrow: false, scaleBar: false });
    expect(viewportMarkFlags({ northArrow: true, scaleBar: true, keyPlanOf: 'a' }, view({ kind: 'plan' }))).toEqual({ northArrow: false, scaleBar: false });
    expect(viewportMarkFlags({ northArrow: true, scaleBar: true }, undefined)).toEqual({ northArrow: false, scaleBar: false });
  });
});

describe('the room the marks sit in', () => {
  it('is the box inside the drawing area, none when they do not meet', () => {
    const area = { x: 10, y: 10, w: 300, h: 200 };
    expect(markArea({ x: 0, y: 100, w: 100, h: 300 }, area)).toEqual({ x: 10, y: 100, w: 90, h: 110 });
    expect(markArea({ x: 400, y: 0, w: 10, h: 10 }, area)).toBeNull();
  });
});

describe('the box the marks are placed in', () => {
  const drawn = { x: 100, y: 100, w: 300, h: 200 };
  it('is the user\'s crop, else the drawing\'s own extent', () => {
    expect(markBox({ x: 250, y: 200, width: 0, height: 0 }, drawn)).toEqual(drawn);
    expect(markBox({ x: 250, y: 200, width: 100, height: 60 }, drawn)).toEqual({ x: 200, y: 170, w: 100, h: 60 });
    expect(markBox({ x: 250, y: 200, width: 0, height: 0 }, null)).toBeNull();
  });
});
