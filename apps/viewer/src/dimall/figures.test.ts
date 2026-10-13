/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The figures of DIMALL's strings: none on another figure, none on a line, on every house the fixtures have. */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionLayout } from '@/drafting/annotation.js';
import { figureUp } from '@/drafting/figure-layout.js';
import { textBlock } from '@/drafting/text-block.js';
import { resetProject } from '@/project/project-store';
import { newDraft } from '@/drafting/draft-store.js';
import { sectionSymbolShapes } from '@/drafting/section-symbol.js';
import type { DraftEntity, EntityShape, Pt } from '@/drafting/types';
import { dimensionDrafts } from './apply.js';
import { stringsThroughHeads, symbolPieces } from './avoid.js';
import { house, lShape, mitred, turned } from './fixture.js';
import { planDimensions } from './plan.js';
import type { PlanPart } from './types';

const H = 0.25;
/** A figure's glyph box (corners, convex) or a line (two points), in drawing space. */
interface Shape { pts: Pt[]; what: string }

const inside = (poly: readonly Pt[], p: Pt) => {
  const signs = poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); });
  return signs.every((v) => v >= 0) || signs.every((v) => v <= 0);
};
/** Points spread over a shape: along a line, over the area of a box. */
const samples = (s: Shape): Pt[] => {
  const [a, b, c] = s.pts;
  const n = 200;
  if (s.pts.length === 2) return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
  const out: Pt[] = [];
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 4; j++) {
    const t = i / 12, u = j / 4;
    out.push({ x: a.x + (b.x - a.x) * t + (c.x - b.x) * u, y: a.y + (b.y - a.y) * t + (c.y - b.y) * u });
  }
  return out;
};
const overlap = (f: Shape, g: Shape) => samples(g).some((p) => inside(f.pts, p)) || (g.pts.length > 2 && samples(f).some((p) => inside(g.pts, p)));

/** The glyph box of a dimension's figure and every line of every dimension, in drawing space. */
function boxes(drafts: readonly DraftEntity[]): { figures: Shape[]; lines: Shape[] } {
  const figures: Shape[] = [], lines: Shape[] = [];
  for (const d of drafts) {
    if (d.shape.type !== 'dimension') continue;
    const l = dimensionLayout(d.shape);
    const along = { x: Math.cos(l.textAngle), y: Math.sin(l.textAngle) };
    const up = figureUp(along, -1, 1);
    const w = textBlock(l.label, H).outer.x1;
    const c = (s: number, t: number): Pt => ({ x: l.textAt.x + along.x * s + up.x * t, y: l.textAt.y + along.y * s + up.y * t });
    figures.push({ pts: [c(-w / 2, 0.3 * H), c(w / 2, 0.3 * H), c(w / 2, 1.02 * H), c(-w / 2, 1.02 * H)], what: `${l.label}@${l.textAt.x.toFixed(2)},${l.textAt.y.toFixed(2)}` });
    // The three lines (extension, extension, dimension); a leader belongs to its own figure.
    l.lines.slice(0, 3).forEach((s, i) => lines.push({ pts: [s.a, s.b], what: `${i === 2 ? 'line' : 'ext'} of ${l.label}` }));
  }
  return { figures, lines };
}

/** Every collision between figures and lines, as words. */
export function collisions(parts: readonly PlanPart[], view: readonly DraftEntity[] = []): string[] {
  const plan = planDimensions(parts, { paperUnit: 0.1, textHeight: H });
  const drafts = dimensionDrafts(plan, { viewId: 'v', layerId: 'l', textHeight: H, textStyle: 'Standard', dimStyle: 'Standard' }, [], view);
  const { figures, lines } = boxes(drafts);
  // The symbol's cut line is a line too.
  view.forEach((e) => { if (e.shape.type === 'line') lines.push({ pts: [e.shape.a, e.shape.b], what: 'cut line' }); });
  const out: string[] = [];
  figures.forEach((f, i) => {
    figures.slice(i + 1).forEach((g) => { if (overlap(f, g)) out.push(`${f.what} on ${g.what}`); });
    lines.forEach((l) => { if (overlap(f, l)) out.push(`${f.what} on ${l.what}`); });
  });
  return out;
}

beforeEach(() => resetProject());

describe('DIMALL figures', () => {
  it('puts no figure on another figure or on a line (FZK-Haus ground plan)', () => {
    assert.deepEqual(collisions(JSON.parse(readFileSync(new URL('./fzk-ground-plan.json', import.meta.url), 'utf8')) as PlanPart[]), []);
  });
  it('puts no figure on another figure or on a line (house)', () => assert.deepEqual(collisions(house()), []));
  it('puts no figure on another figure or on a line (L)', () => assert.deepEqual(collisions(lShape()), []));
  it('puts no figure on another figure or on a line (mitred)', () => assert.deepEqual(collisions(mitred()), []));
  it('puts no figure on another figure or on a line (turned house)', () => assert.deepEqual(collisions(turned(house(), 0.5)), []));
});

describe('DIMALL and section marks', () => {
  const symbol = (a: Pt, b: Pt) => sectionSymbolShapes(a, b, { x: 0, y: 0 }, 'B', H).map((shape) => ({ ...newDraft('v', 'l', shape as EntityShape), params: { sectionOf: 'sec' } }));
  it('keeps every figure off a section line cut through the house', () => {
    // North-south through the middle of the south string and the north string: x = 6.0 passes the 2.00 / 3.00 figures.
    const view = symbol({ x: 6, y: -4 }, { x: 6, y: 14 });
    assert.deepEqual(collisions(house(), view), []);
  });
  it('counts the strings that run through the arrow or letter of a section mark', () => {
    const view = symbol({ x: 6, y: -1 }, { x: 6, y: 11 });
    const plan = planDimensions(house(), { paperUnit: 0.1, textHeight: H });
    assert.ok(stringsThroughHeads(plan.strings, symbolPieces(view), H) > 0);
    assert.equal(stringsThroughHeads(plan.strings, symbolPieces([]), H), 0);
  });
});
