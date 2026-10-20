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
import { scaleBarShapes } from '@/siteplan/scale-bar';

export type SymbolInstance = SymbolInstanceShape;

const text = (x: number, y: number, t: string, height: number): SymbolShape => ({ type: 'text', p: { x, y }, text: t, height, rotation: 0 });
const poly = (pts: [number, number][], closed = false): SymbolShape => ({ type: 'polyline', pts: pts.map(([x, y]) => ({ x, y })), closed });
const line = (x1: number, y1: number, x2: number, y2: number): SymbolShape => ({ type: 'line', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });

/**
 * Insulation batting along +x: the usual detail sign of loops, a prolate
 * trochoid (its loop radius exceeds its pitch over 2π, so each turn crosses
 * itself) between the two faces of a layer `length` long and `thickness` thick.
 */
function batting(length: number, thickness: number, loops: number): SymbolShape[] {
  const pitch = length / loops;
  const r = thickness * 0.45;
  const steps = loops * 24;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * loops * Math.PI * 2;
    pts.push([(pitch / (Math.PI * 2)) * t - r * Math.sin(t), thickness / 2 - r * Math.cos(t)]);
  }
  return [poly([[0, 0], [length, 0]]), poly([[0, thickness], [length, thickness]]), poly(pts)];
}

/** `count` stretcher bricks (215 x 65 mm, 10 mm joints) in one course, in metres. */
function brickCourse(count: number): SymbolShape[] {
  const w = 0.215;
  const h = 0.065;
  const joint = 0.01;
  return Array.from({ length: count }, (_, i) => poly([[i * (w + joint), 0], [i * (w + joint) + w, 0], [i * (w + joint) + w, h], [i * (w + joint), h]], true));
}

/** A rolled I section outline about its centroid, in metres (h, b, web and flange thickness in millimetres). */
function iSection(h: number, b: number, tw: number, tf: number): SymbolShape[] {
  const [H, B, W, F] = [h, b, tw, tf].map((v) => v / 1000);
  const x = B / 2;
  const w = W / 2;
  const y = H / 2;
  return [poly([[-x, -y], [x, -y], [x, -y + F], [w, -y + F], [w, y - F], [x, y - F], [x, y], [-x, y], [-x, y - F], [-w, y - F], [-w, -y + F], [-x, -y + F]], true)];
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
  // Laid out here for 1:100; wherever it is drawn it is laid out again for that drawing's scale (`siteplan/live-symbols.ts`).
  { id: 'builtin:scale-bar', name: 'Scale bar', unit: 'model', shapes: scaleBarShapes(100) },
  // A point whose map coordinates (E / N) are printed beside it where it is drawn (`siteplan/live-symbols.ts`).
  {
    id: 'builtin:coordinate-point', name: 'Coordinate point', unit: 'paper',
    shapes: [line(-2.5, 0, 2.5, 0), line(0, -2.5, 0, 2.5), { type: 'circle', c: { x: 0, y: 0 }, r: 1.2 }],
  },
  {
    id: 'builtin:centre-line', name: 'Centre line mark', unit: 'paper',
    shapes: [line(-12, 0, -4, 0), line(-2, 0, 2, 0), line(4, 0, 12, 0), line(-4, -3, -4, 3), line(4, -3, 4, 3), text(-2.2, 4.5, 'CL', 3)],
  },
  // Detail components: model-unit symbols, real size in the drawing, so they print smaller at a smaller scale.
  { id: 'builtin:batting', name: 'Insulation batting 1 m x 100 mm', unit: 'model', shapes: batting(1, 0.1, 10) },
  { id: 'builtin:brick-course', name: 'Brick course, 5 stretchers', unit: 'model', shapes: brickCourse(5) },
  { id: 'builtin:ipe-200', name: 'Steel section IPE 200', unit: 'model', shapes: iSection(200, 100, 5.6, 8.5) },
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
