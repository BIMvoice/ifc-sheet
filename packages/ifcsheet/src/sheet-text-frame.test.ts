/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A text's frame and leader and a moved dimension figure's leader, printed on a viewport (#479). */

import { describe, expect, it } from 'vitest';
import type { SheetViewport } from './document.js';
import { linearLayout } from './dimension-layout.js';
import type { DraftEntity } from './draft-types.js';
import { frameOutline } from './sheet-text-frame.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';
import { tableWidthEm } from './text-advance.js';

// A plan (y down) at 1:100: a drawing metre is 10 paper mm, a text 0.25 m high is 2.5 mm.
const vp = { id: 'vp', viewId: 'v', x: 0, y: 0, scale: 100 } as unknown as SheetViewport;
const draft = (shape: DraftEntity['shape']): DraftEntity => ({ id: 'd', viewId: 'v', layerId: 'L', shape, params: {} });
const print = (shape: DraftEntity['shape']) => viewportAnnotations(
  { view: undefined, vp, at: (p) => ({ x: p.x * 10, y: p.y * 10 }), frame: { kx: 1, ky: 1 }, box: null },
  { drafts: [draft(shape)], layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' } satisfies SheetAnnotations,
);
const text = (more: Record<string, unknown>): DraftEntity['shape'] => ({ type: 'text', p: { x: 0, y: 0 }, text: 'AB', height: 0.25, rotation: 0, ...more }) as DraftEntity['shape'];

const SIZE = 2.5;
const WIDTH = tableWidthEm('AB') * SIZE;

describe('a text\'s frame', () => {
  it('a text with no frame prints no stroke', () => {
    expect(print(text({})).strokes).toEqual([]);
  });

  it('a box is the rectangle round the text, a half height clear on every side, in the text colour at the app\'s width', () => {
    const [frame] = print(text({ frame: 'box' })).strokes;
    const [x0, y0, x1, y1] = [-0.5 * SIZE, -(0.72 + 0.5) * SIZE, WIDTH + 0.5 * SIZE, (0.22 + 0.5) * SIZE];
    expect(frame.colour).toBe('#000');
    expect(frame.width).toBe(0.5);
    expect(frame.runs).toHaveLength(1);
    frame.runs[0].forEach((p, i) => {
      const want = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]][i];
      expect(p.x).toBeCloseTo(want[0], 9);
      expect(p.y).toBeCloseTo(want[1], 9);
    });
  });

  it('a frame turns with the text', () => {
    const [frame] = print(text({ frame: 'box', rotation: Math.PI / 2 })).strokes;
    // Turned a quarter, the text reads downward on a plan (y down): the frame's first corner (x0, y0) lands at (-y0, x0).
    const [x0, y0] = [-0.5 * SIZE, -(0.72 + 0.5) * SIZE];
    const first = frame.runs[0][0];
    const expected = [{ x: -y0, y: x0 }, { x: y0, y: -x0 }];
    const [near] = expected.map((e) => Math.hypot(first.x - e.x, first.y - e.y)).sort((a, b) => a - b);
    expect(near).toBeLessThan(1e-9);
  });

  it('a bubble is an ellipse round the text with its four quadrant points among its vertices', () => {
    const [frame] = print(text({ frame: 'bubble' })).strokes;
    const run = frame.runs[0];
    expect(run[0]).toEqual(run[run.length - 1]);
    const xs = run.map((p) => p.x), ys = run.map((p) => p.y);
    // Round for a short tag: centre at the middle of the padded text box, a radius reaching past every corner of it.
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(cx).toBeCloseTo((-0.5 * SIZE + WIDTH + 0.5 * SIZE) / 2, 9);
    expect(cy).toBeCloseTo((-(0.72 + 0.5) * SIZE + (0.22 + 0.5) * SIZE) / 2, 9);
    expect(Math.max(...xs) - cx).toBeCloseTo(Math.max(...ys) - cy, 9);
    expect(run.some((p) => Math.abs(p.x - Math.max(...xs)) < 1e-9 && Math.abs(p.y - cy) < 1e-9)).toBe(true);
  });

  it('a rounded box has the rectangle\'s extent and corners cut by arcs', () => {
    const outline = frameOutline({ kind: 'rect', x: 0, y: 0, w: 10, h: 6, radius: 1.5 });
    expect(Math.min(...outline.map((p) => p.x))).toBeCloseTo(0, 9);
    expect(Math.max(...outline.map((p) => p.x))).toBeCloseTo(10, 9);
    expect(Math.max(...outline.map((p) => p.y))).toBeCloseTo(6, 9);
    expect(outline.some((p) => p.x === 0 && p.y === 0)).toBe(false);
    expect(outline[0]).toEqual(outline[outline.length - 1]);
  });
});

describe('a text\'s leader', () => {
  it('runs from the frame\'s edge to the tip with an arrow at the tip, in the layer\'s colour', () => {
    const { strokes } = print(text({ frame: 'box', leader: { x: 3, y: 0 } }));
    const line = strokes.find((s) => s.width === 0.25 && !s.fill);
    expect(line).toBeDefined();
    const [from, tip] = line!.runs[0];
    expect(from.x).toBeCloseTo((tableWidthEm('AB') * 0.25 + 0.125) * 10, 9);
    expect(from.y).toBeCloseTo(0, 9);
    expect(tip).toEqual({ x: 30, y: 0 });
    const head = strokes.find((s) => s.fill);
    expect(head).toBeDefined();
    expect(Math.max(...head!.runs[0].map((p) => p.x))).toBeCloseTo(30, 9);
  });

  it('a tip inside the frame has none', () => {
    expect(print(text({ frame: 'box', leader: { x: 0.1, y: 0 } })).strokes.filter((s) => !s.fill && s.width === 0.25)).toEqual([]);
  });
});

describe('a dimension figure moved off its line', () => {
  const dimension = (more: Record<string, unknown>): DraftEntity['shape'] => ({ type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 0, y: 1 }, height: 0.25, ...more }) as DraftEntity['shape'];

  it('keeps its three lines when the figure is on its line', () => {
    expect(print(dimension({})).strokes[0].runs).toHaveLength(3);
  });

  it('carries a leader from the middle of the dimension line to the figure, and the figure is printed where it was moved to', () => {
    const moved = print(dimension({ textAt: { x: 2, y: 3 } }));
    const runs = moved.strokes[0].runs;
    expect(runs).toHaveLength(4);
    const line = linearLayout({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 1 }, 'aligned', undefined, {}).lines[2];
    const [from, to] = runs[3];
    expect(from.x).toBeCloseTo(((line.a.x + line.b.x) / 2) * 10, 9);
    expect(from.y).toBeCloseTo(((line.a.y + line.b.y) / 2) * 10, 9);
    // It ends at the figure, not on the line: within a figure's width of where the figure sits.
    expect(Math.hypot(to.x - 20, to.y - 30)).toBeLessThan(WIDTH * 4);
    expect(moved.texts[0].at.x).toBeCloseTo(20, 9);
  });
});
