/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #842: a leader may end in a dot (signage drawings) or in nothing, and an arrow stays the default. A text's leader and a
 * leader print the end they ask for on the sheet the PDF, SVG and DXF are written from; a project file keeps it; a label
 * type's end goes on the labels it places.
 */

import { describe, expect, it } from 'vitest';
import type { Point2D } from '@ifc-lite/drawing-2d';
import type { SheetViewport } from './document.js';
import { DEFAULT_DIM_STYLE } from './draft-styles.js';
import { readDraft } from './draft-read.js';
import type { DraftEntity } from './draft-types.js';
import { exportPdf } from './export.js';
import { leaderHeadSize, withLeaderEnd } from './leader-head.js';
import { labelDraft, type LabelEnv } from './labels/label-draft.js';
import type { LabelElement } from './labels/label-resolve.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';
import { sheetGraphicToDxf } from './sheet-dxf.js';
import type { SheetGraphic } from './sheet-graphic.js';
import { K } from './sheet-marks.js';
import { tickStrokes, type SheetStroke } from './sheet-stroke.js';
import { exportSvg } from './svg-export.js';

// A plan at 1:100 (a drawing metre is 10 paper mm), the drawing's origin at paper (100, 100), y up the paper.
const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
const at = (p: { x: number; y: number }): Point2D => ({ x: 100 + p.x * 10, y: 100 - p.y * 10 });
const draft = (shape: object): DraftEntity => ({ id: 'd', viewId: 'v', layerId: 'L', shape, params: {} }) as DraftEntity;
const print = (shape: object): SheetStroke[] => viewportAnnotations(
  { view: undefined, vp, at, frame: { kx: 1, ky: -1 }, box: null },
  { drafts: [draft(shape)], layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' } satisfies SheetAnnotations,
).strokes;
const heads = (shape: object) => print(shape).filter((s) => s.fill);

// A label to the left of a sign, its leader running right to the sign's edge at drawing (3, 0): paper (130, 100).
const text = (more: object = {}) => ({ type: 'text', p: { x: 0, y: 0 }, text: 'S-01', height: 0.25, rotation: 0, leader: { x: 3, y: 0 }, ...more });
const leader = (more: object = {}) => ({ type: 'leader', pts: [{ x: 3, y: 0 }, { x: 1, y: 1 }], text: 'S-01', height: 0.25, ...more });
const TIP = { x: 130, y: 100 };
const SIZE = leaderHeadSize(DEFAULT_DIM_STYLE.arrowSize, 4 * K);

/** The one filled ring of `strokes`: its centre and its least and greatest radius. */
function ring(strokes: SheetStroke[]) {
  expect(strokes).toHaveLength(1);
  expect(strokes[0].runs).toHaveLength(1);
  const run = strokes[0].runs[0];
  const pts = run.slice(0, -1);
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  const r = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  return { c, rMin: Math.min(...r), rMax: Math.max(...r), points: pts.length, closed: run[0].x === run[run.length - 1].x && run[0].y === run[run.length - 1].y };
}

describe('a leader\'s end on the sheet (#842)', () => {
  for (const [what, shape] of [['a text\'s leader', text], ['a leader', leader]] as const) {
    it(`${what} with the dot end ends in a filled round dot centred on its tip`, () => {
      const dot = ring(heads(shape({ leaderEnd: 'dot' })));
      expect(dot.points).toBe(12);
      expect(dot.closed).toBe(true);
      expect(dot.c.x).toBeCloseTo(TIP.x, 9);
      expect(dot.c.y).toBeCloseTo(TIP.y, 9);
      expect(dot.rMin).toBeCloseTo(SIZE * 0.3, 9);
      expect(dot.rMax).toBeCloseTo(SIZE * 0.3, 9);
    });

    it(`${what} with no end has a line and no head`, () => {
      expect(heads(shape({ leaderEnd: 'none' }))).toEqual([]);
      expect(print(shape({ leaderEnd: 'none' })).some((s) => !s.fill && s.runs.some((r) => r.some((p) => Math.hypot(p.x - TIP.x, p.y - TIP.y) < 1e-9)))).toBe(true);
    });

    it(`${what} that names no end keeps the arrow it had before: the dimension arrow mark, filled, at the same size`, () => {
      const head = heads(shape());
      const from = shape === text ? print(shape()).find((s) => !s.fill)!.runs[0][0] : at({ x: 1, y: 1 });
      const before = tickStrokes('arrow', [{ p: TIP, dir: { x: TIP.x - from.x, y: TIP.y - from.y } }], SIZE, head[0]?.colour ?? '', K);
      expect(head.map(({ dxf: _tags, ...stroke }) => stroke)).toEqual(before);
    });
  }
});

/** A sheet holding only what the drafts print, as the PDF, SVG and DXF writers take it. */
const sheetOf = (strokes: SheetStroke[]): SheetGraphic => ({
  sheetId: 's', number: 'A-101', name: 'Signage', paper: { w: 297, h: 210 }, frame: [], fills: [], cut: [], lines: [], pens: [], marks: [], images: [],
  underlays: [], viewports: [], symbols: { solids: [], strokes: [] }, texts: [], strokes,
});

/** The vertices of each SOLID HATCH boundary the DXF holds, paper mm (y up). */
function hatches(dxf: Uint8Array): Point2D[][] {
  const lines = new TextDecoder('windows-1252').decode(dxf).split(/\r?\n/).map((l) => l.trim());
  const pairs = Array.from({ length: Math.floor(lines.length / 2) }, (_, i) => [lines[2 * i], lines[2 * i + 1]] as const);
  const out: Point2D[][] = [];
  let inHatch = false;
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === '0') inHatch = value === 'HATCH';
    else if (inHatch && code === '93') {
      const n = Number(value);
      out.push(Array.from({ length: n }, (_, k) => ({ x: Number(pairs[i + 1 + 2 * k][1]), y: Number(pairs[i + 2 + 2 * k][1]) })));
      i += 2 * n;
    }
  }
  return out;
}

describe('the dot comes through every output of the engine (#842)', () => {
  const dot = sheetOf(print(text({ leaderEnd: 'dot' })));
  const arrow = sheetOf(print(text()));

  it('the SVG fills a 12-sided dot round the tip', () => {
    const polygons = [...exportSvg(dot).matchAll(/<polygon points="([^"]+)" fill="#000"/g)].map((m) => m[1].split(' '));
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(13);
  });

  it('the DXF writes the dot as a solid hatch round the tip, and the arrow as one too', () => {
    const loops = hatches(sheetGraphicToDxf(dot));
    expect(loops.map((l) => l.length)).toEqual([12]);
    const c = loops[0].reduce((s, p) => ({ x: s.x + p.x / 12, y: s.y + p.y / 12 }), { x: 0, y: 0 });
    expect(c.x).toBeCloseTo(TIP.x, 3);
    expect(c.y).toBeCloseTo(210 - TIP.y, 3);
    expect(hatches(sheetGraphicToDxf(arrow)).map((l) => l.length)).toEqual([3]);
  });

  it('the PDF fills one path for the dot, with a vertex for each of its 12 sides, and three for the arrow', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const fills = async (sheet: SheetGraphic): Promise<number[]> => {
      const task = pdfjs.getDocument({ data: await exportPdf([sheet]) });
      try {
        const ops = await (await (await task.promise).getPage(1)).getOperatorList();
        // Each filled path: how many line-to steps it holds (pdfjs packs a path's steps as [op, coordinates...]).
        return ops.fnArray.flatMap((fn, i) => {
          if (fn !== pdfjs.OPS.constructPath || ops.argsArray[i][0] !== pdfjs.OPS.fill) return [];
          const data = Array.from(ops.argsArray[i][1][0] as ArrayLike<number>);
          let steps = 0;
          for (let j = 0; j < data.length;) {
            const op = data[j];
            if (op === 1) steps++;
            j += op === 0 || op === 1 ? 3 : op === 2 || op === 3 ? 7 : 1;
          }
          return [steps];
        });
      } finally {
        await task.destroy();
      }
    };
    expect(await fills(dot)).toEqual([11]);
    expect(await fills(arrow)).toEqual([2]);
    expect(await fills(sheetOf(print(text({ leaderEnd: 'none' }))))).toEqual([]);
  });
});

describe('a project file keeps a leader\'s end (#842)', () => {
  const read = (shape: object) => readDraft({ id: 'd', viewId: 'v', layerId: 'L', shape, params: {} }, '/drafts/0').shape;

  it('a dot and none come back; an arrow, the default, is not stored', () => {
    expect(read(text({ leaderEnd: 'dot' }))).toMatchObject({ leaderEnd: 'dot' });
    expect(read(leader({ leaderEnd: 'none' }))).toMatchObject({ leaderEnd: 'none' });
    expect(read(text({ leaderEnd: 'arrow' }))).not.toHaveProperty('leaderEnd');
    expect(read(text())).not.toHaveProperty('leaderEnd');
  });

  it('an end that is none of them is refused with its place in the file', () => {
    expect(() => read(text({ leaderEnd: 'tick' }))).toThrow('/drafts/0.shape.leaderEnd must be arrow, dot or none');
  });
});

describe('a label type\'s leader end goes on its labels (#842)', () => {
  // A template with no field: the label's text needs nothing of the element but that it is loaded.
  const element = {} as LabelElement;
  const env: LabelEnv = { read: () => element, up: -1, styled: () => ({}), newId: () => 'n' };
  const place = { viewId: 'v', layerId: 'L', textHeight: 0.25, textStyle: 's', dimStyle: 'd', paperUnit: 0.1, locale: 'en' as const };
  const ring = [{ x: 5, y: -1 }, { x: 7, y: -1 }, { x: 7, y: 1 }, { x: 5, y: 1 }];
  const label = (leaderEnd?: 'arrow' | 'dot' | 'none') => labelDraft(env, { id: 't', name: 'Sign', tool: 'label', label: { template: 'S-01', missing: 'question', leader: 'always', ...(leaderEnd ? { leaderEnd } : {}) } }, 'g', { x: 0, y: 0 }, place, ring)!.shape;

  it('a type with the dot places labels whose leader ends in a dot; one with the arrow or none named, labels as before', () => {
    expect(label('dot')).toMatchObject({ type: 'text', leader: expect.any(Object), leaderEnd: 'dot' });
    expect(label('none')).toMatchObject({ leaderEnd: 'none' });
    expect(label('arrow')).toEqual(label());
    expect(label()).not.toHaveProperty('leaderEnd');
  });

  it('withLeaderEnd sets, clears and leaves alone', () => {
    const plain = text() as { leaderEnd?: 'dot' | 'none' };
    expect(withLeaderEnd(plain, undefined)).toBe(plain);
    expect(withLeaderEnd(plain, 'arrow')).toBe(plain);
    const dotted = withLeaderEnd(plain, 'dot');
    expect(dotted.leaderEnd).toBe('dot');
    expect(withLeaderEnd(dotted, 'dot')).toBe(dotted);
    expect(withLeaderEnd(dotted, 'arrow')).not.toHaveProperty('leaderEnd');
  });
});
