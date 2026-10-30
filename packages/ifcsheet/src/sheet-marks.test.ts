/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The hatches a viewport prints (#479): a pattern the project imported, one it lacks, symbols, and the kinds drawn. */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import type { SheetViewport } from './document.js';
import type { DraftEntity } from './draft-types.js';
import { parsePat } from './hatch-pattern.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';

const vp = { id: 'vp', viewId: 'v', x: 0, y: 0, scale: 100 } as unknown as SheetViewport;
const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const draft = (shape: DraftEntity['shape']): DraftEntity => ({ id: 'd', viewId: 'v', layerId: 'L', shape, params: {} });
const base = (drafts: DraftEntity[], more: Partial<SheetAnnotations> = {}): SheetAnnotations => ({
  drafts, layers: [], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en', ...more,
});
const print = (a: SheetAnnotations, plane?: SectionPlaneConfig) => viewportAnnotations({ view: undefined, vp, at: (p) => ({ x: p.x * 10, y: p.y * 10 }), frame: { kx: 1, ky: 1 }, box: null, ...(plane ? { plane } : {}) }, a);

describe('hatches on a viewport', () => {
  const hatch = (pattern: string) => draft({ type: 'hatch', loops: [square], pattern, scale: 1, angle: 0 });

  it('a pattern the project imported prints as its lines', () => {
    const patterns = parsePat('*MYLINES, mine\n0, 0,0, 0,2').patterns;
    const lines = print(base([hatch('MYLINES')], { patterns })).strokes.filter((s) => s.round);
    expect(lines).toHaveLength(1);
    expect(lines[0].runs.length).toBeGreaterThan(1);
  });

  it('a pattern nobody holds prints as the faint fill the app draws', () => {
    const [fill] = print(base([hatch('NOSUCH')])).strokes;
    expect(fill).toMatchObject({ fill: true, region: true, opacity: 0.15 });
  });

  it('a solid pattern fills more strongly than a missing one', () => {
    expect(print(base([hatch('SOLID')])).strokes[0]).toMatchObject({ fill: true, region: true, opacity: 0.85 });
  });
});

describe('symbols on a viewport', () => {
  const symbol = (symbolId: string, extra: Record<string, unknown> = {}) => draft({ type: 'symbol', symbolId, p: { x: 0, y: 0 }, scale: 1, rotation: 0, ...extra } as DraftEntity['shape']);
  const site = (more: Partial<NonNullable<SheetAnnotations['site']>> = {}): NonNullable<SheetAnnotations['site']> => ({ north: null, frameOffset: { x: 0, y: 0, z: 0 }, ...more });

  it('a built-in symbol is drawn', () => {
    const out = print(base([symbol('builtin:north-arrow')]));
    expect(out.strokes[0].runs).toHaveLength(3);
    expect(out.texts.map((t) => t.text)).toEqual(['N']);
  });

  it("a project's own symbol is drawn from its definition", () => {
    const own = [{ id: 'mine', name: 'Mine', unit: 'paper' as const, shapes: [{ type: 'line' as const, a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }] }];
    const [stroke] = print(base([symbol('mine')], { symbols: own })).strokes;
    expect(stroke.runs).toEqual([[{ x: 0, y: 0 }, { x: 50, y: 0 }]]);
  });

  it('a symbol nobody holds stands as the dashed cross', () => {
    const [stroke] = print(base([symbol('gone')])).strokes;
    expect(stroke.dash).toBeDefined();
    expect(stroke.runs).toHaveLength(2);
  });

  it('a north arrow that follows north turns to the model\'s north on a plan', () => {
    const plane = { axis: 'y', position: 1, flipped: false } as never;
    const north = (x: number, y: number) => print(base([symbol('builtin:north-arrow', { followsNorth: true })], { site: site({ north: { x, y } }) }), plane);
    const up = north(0, 1).texts[0].at;
    const east = north(1, 0).texts[0].at;
    expect(Math.hypot(east.x - up.x, east.y - up.y)).toBeGreaterThan(1);
  });

  it('a coordinate point prints the local coordinates of a model with no map conversion', () => {
    const plane = { axis: 'y', position: 0, flipped: false } as never;
    const out = print(base([symbol('builtin:coordinate-point', { p: { x: 2, y: 3 } })], { site: site({ frameOffset: { x: 10, y: 0, z: 20 } }) }), plane);
    expect(out.texts.map((t) => t.text)).toEqual(['X 12.00 (local)', 'Y -23.00 (local)']);
  });

  it('a coordinate point on a georeferenced model prints the Easting and Northing its frame gives, not the local X and Y', () => {
    const plane = { axis: 'y', position: 0, flipped: false } as never;
    const mapPoint = (_: unknown, p: { x: number; y: number }) => ({ e: 588_000 + p.x, n: 326_000 + p.y });
    const out = print(base([symbol('builtin:coordinate-point', { p: { x: 2, y: 3 } })], { site: site({ mapPoint: mapPoint as never, frameOffset: { x: 10, y: 0, z: 20 } }) }), plane);
    expect(out.texts.map((t) => t.text)).toEqual(['E 588002.00', 'N 326003.00']);
  });
});

describe('what is drawn', () => {
  it('a level mark, a circle and an arc are drawn', () => {
    const out = print(base([
      draft({ type: 'level', p: { x: 0, y: 0 }, value: 2.7, height: 0.25 }),
      draft({ type: 'circle', c: { x: 0, y: 0 }, r: 1 }),
      draft({ type: 'arc', c: { x: 0, y: 0 }, r: 1, start: 0, end: 1 }),
    ]));
    expect(out.texts.map((t) => t.text)).toEqual(['+2.70']);
  });
});
