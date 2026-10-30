/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The hatches a viewport prints (#479): a pattern the project imported, one it lacks, and the kinds still reported as left out. */

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
const print = (a: SheetAnnotations) => viewportAnnotations({ view: undefined, vp, at: (p) => ({ x: p.x * 10, y: p.y * 10 }), frame: { kx: 1, ky: 1 }, box: null }, a);

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

describe('what is still left out', () => {
  it('a symbol is reported, not drawn', () => {
    const skipped: string[] = [];
    const out = print(base([draft({ type: 'symbol', symbolId: 'builtin:north-arrow', p: { x: 0, y: 0 }, scale: 1, rotation: 0 })], { onSkipped: (kind) => skipped.push(kind) }));
    expect(skipped).toEqual(['symbol']);
    expect(out.strokes).toEqual([]);
  });

  it('a level mark, a circle and an arc are drawn, not reported', () => {
    const skipped: string[] = [];
    const out = print(base([
      draft({ type: 'level', p: { x: 0, y: 0 }, value: 2.7, height: 0.25 }),
      draft({ type: 'circle', c: { x: 0, y: 0 }, r: 1 }),
      draft({ type: 'arc', c: { x: 0, y: 0 }, r: 1, start: 0, end: 1 }),
    ], { onSkipped: (kind) => skipped.push(kind) }));
    expect(skipped).toEqual([]);
    expect(out.texts.map((t) => t.text)).toEqual(['+2.70']);
  });
});
