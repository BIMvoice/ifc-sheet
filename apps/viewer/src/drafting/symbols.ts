/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Symbols: blocks of drafted shapes around an insertion point (the origin),
 * placed as instances that refer to their definition — so editing the
 * definition changes every instance. Pure: this module holds the library
 * the geometry functions look definitions up in (the project's symbols plus
 * the built-in ones, which are drawn here in code) and turns an instance
 * into the shapes it stands for.
 */

import type { DraftSymbol, SymbolShape } from '@/catalogue/types';
import type { DraftShape, Pt, SymbolInstanceShape } from './types';
import { polar, rotatePt, sweepOf, TAU } from './vec';

export type SymbolInstance = SymbolInstanceShape;

const text = (x: number, y: number, t: string, height: number): SymbolShape => ({ type: 'text', p: { x, y }, text: t, height, rotation: 0 });
const poly = (pts: [number, number][], closed = false): SymbolShape => ({ type: 'polyline', pts: pts.map(([x, y]) => ({ x, y })), closed });
const line = (x1: number, y1: number, x2: number, y2: number): SymbolShape => ({ type: 'line', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });

/** A scale bar of `metres` in 1 m divisions along +x, in model metres; alternate divisions are ruled to read as shaded. */
function scaleBar(metres: number): SymbolShape[] {
  const h = 0.16;
  const out: SymbolShape[] = [poly([[0, 0], [metres, 0], [metres, h], [0, h]], true)];
  for (let m = 0; m <= metres; m++) {
    out.push(line(m, 0, m, h + 0.06));
    out.push(text(m - (String(m).length * 0.25 * 0.62) / 2, h + 0.14, String(m), 0.25));
  }
  for (let m = 0; m < metres; m += 2) for (let k = 1; k <= 3; k++) out.push(line(m, (h * k) / 4, m + 1, (h * k) / 4));
  out.push(text(metres + 0.2, 0.02, 'm', 0.25));
  return out;
}

/** The symbols that ship with the app, drawn in code. Ids start with `builtin:`; a project's own symbols never do. */
export const BUILT_IN_SYMBOLS: readonly DraftSymbol[] = [
  {
    id: 'builtin:north-arrow', name: 'North arrow', unit: 'paper',
    shapes: [
      { type: 'circle', c: { x: 0, y: 0 }, r: 9 },
      poly([[0, 8], [-4, -8], [0, -4], [4, -8]], true),
      line(0, -4, 0, 8),
      text(-1.2, 11, 'N', 3.5),
    ],
  },
  { id: 'builtin:scale-bar', name: 'Scale bar 5 m', unit: 'model', shapes: scaleBar(5) },
  {
    id: 'builtin:centre-line', name: 'Centre line mark', unit: 'paper',
    shapes: [line(-12, 0, -4, 0), line(-2, 0, 2, 0), line(4, 0, 12, 0), line(-4, -3, -4, 3), line(4, -3, 4, 3), text(-2.2, 4.5, 'CL', 3)],
  },
  {
    id: 'builtin:tag-bubble', name: 'Tag bubble', unit: 'paper',
    shapes: [{ type: 'circle', c: { x: 0, y: 0 }, r: 4.5 }, text(-1.55, -0.9, '01', 2.5)],
  },
];

let library: readonly DraftSymbol[] = [];

/** The project's symbols, as the geometry functions should see them. */
export function setSymbolLibrary(symbols: readonly DraftSymbol[] | undefined): void {
  library = symbols ?? [];
}

/** A symbol by id: the project's, else a built-in one. */
export function findSymbol(id: string, own: readonly DraftSymbol[] = library): DraftSymbol | undefined {
  return own.find((s) => s.id === id) ?? BUILT_IN_SYMBOLS.find((s) => s.id === id);
}

/** Every symbol available to place: the built-in ones, then the project's. */
export function allSymbols(own: readonly DraftSymbol[] = library): DraftSymbol[] {
  return [...BUILT_IN_SYMBOLS, ...own];
}

export const isBuiltInSymbol = (id: string): boolean => id.startsWith('builtin:');

/**
 * The drawing units one symbol unit spans where the instance sits: a paper
 * symbol is millimetres of paper (`paperUnit` drawing units each), a model
 * symbol is metres; both times the user's scale factor.
 */
export function symbolDrawingScale(def: Pick<DraftSymbol, 'unit'>, userScale: number, paperUnit: number): number {
  return userScale * (def.unit === 'paper' ? paperUnit : 1);
}

export interface PlacedSymbol {
  geometry: DraftShape[];
  texts: Extract<SymbolShape, { type: 'text' }>[];
}

/**
 * The shapes of an instance in drawing space. `up` is the direction the
 * symbol's own +y takes in drawing space (−1 where the drawing's y runs down
 * the screen, as on a plan), so a symbol always stands upright on the screen
 * and its rotation turns counter-clockwise as the user sees it.
 */
export function placeSymbol(def: DraftSymbol, at: Pick<SymbolInstance, 'p' | 'scale' | 'rotation'>, up: 1 | -1 = 1): PlacedSymbol {
  const origin = { x: 0, y: 0 };
  const angle = at.rotation * up;
  const map = (q: Pt): Pt => {
    const r = rotatePt({ x: q.x, y: q.y * up }, origin, angle);
    return { x: at.p.x + r.x * at.scale, y: at.p.y + r.y * at.scale };
  };
  const geometry: DraftShape[] = [];
  const texts: PlacedSymbol['texts'] = [];
  for (const s of def.shapes) {
    switch (s.type) {
      case 'line': geometry.push({ type: 'line', a: map(s.a), b: map(s.b) }); break;
      case 'polyline': geometry.push({ ...s, pts: s.pts.map(map) }); break;
      case 'circle': geometry.push({ type: 'circle', c: map(s.c), r: s.r * at.scale }); break;
      case 'arc':
        // Reflecting y reverses an arc's sweep: swap its ends.
        geometry.push(up === 1
          ? { type: 'arc', c: map(s.c), r: s.r * at.scale, start: s.start + angle, end: s.end + angle }
          : { type: 'arc', c: map(s.c), r: s.r * at.scale, start: -s.end + angle, end: -s.start + angle });
        break;
      case 'text': texts.push({ ...s, p: map(s.p), height: s.height * at.scale, rotation: s.rotation * up + angle }); break;
    }
  }
  return { geometry, texts };
}

/** A shape as one polyline (`closed` for a circle and for a closed polyline); arcs and circles are sampled. */
export function flattenShape(shape: DraftShape, segments = 32): { pts: Pt[]; closed: boolean } {
  switch (shape.type) {
    case 'line': return { pts: [shape.a, shape.b], closed: false };
    case 'polyline': return { pts: shape.pts, closed: shape.closed };
    case 'circle': {
      const pts = Array.from({ length: segments }, (_, i) => polar(shape.c, shape.r, (i / segments) * TAU));
      return { pts, closed: true };
    }
    case 'arc': {
      const sweep = sweepOf(shape.start, shape.end);
      const n = Math.max(2, Math.ceil((sweep / TAU) * segments));
      return { pts: Array.from({ length: n + 1 }, (_, i) => polar(shape.c, shape.r, shape.start + (sweep * i) / n)), closed: false };
    }
  }
}

/** What stands in for an instance whose symbol is gone: a small cross, so it can still be seen, picked and deleted. */
export function missingSymbolMark(at: Pick<SymbolInstance, 'p' | 'scale'>): DraftShape[] {
  const r = 3 * at.scale;
  return [
    { type: 'line', a: { x: at.p.x - r, y: at.p.y - r }, b: { x: at.p.x + r, y: at.p.y + r } },
    { type: 'line', a: { x: at.p.x - r, y: at.p.y + r }, b: { x: at.p.x + r, y: at.p.y - r } },
  ];
}
