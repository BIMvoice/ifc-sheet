/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The plan symbol of each IfcDoorTypeOperationEnum value whose drawing the IFC4.3 audit changed: REVOLVING_VERTICAL (one leaf pivoting in its
 * middle, not the four-leaf drum), SWING_FIXED_* (a leaf over half the opening beside a fixed panel) and DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_*
 * (the hand as the enum's figures draw it). Read from the value, handed by the placement, drawn: the path a model's door takes.
 */

import { describe, expect, it } from 'vitest';
import { doorSwingFlips, parseDoorOperation } from './door-operation.js';
import { doorSymbol } from './door-symbol.js';
import type { OpeningRect } from './opening-symbols.js';
import type { DraftShape, Pt } from './draft-types.js';

// A 0.9 m opening in a 0.2 m wall, its width along x, the placement's X along +x and its Y (the side a leaf opens to) along +y.
const W = 0.9, D = 0.2;
const rect: OpeningRect = { c: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, width: W, depth: D };
const X = { x: 1, y: 0 }, Y = { x: 0, y: 1 };
const drawn = (value: string) => {
  const op = parseDoorOperation(value);
  if (!op) throw new Error(`${value}: no operation`);
  return doorSymbol(rect, doorSwingFlips(op, X, Y, rect.u, rect.n) ?? 0, op);
};
const arcs = (shapes: DraftShape[]) => shapes.filter((s): s is Extract<DraftShape, { type: 'arc' }> => s.type === 'arc');
const pts = (s: DraftShape): Pt[] => (s.type === 'polyline' ? s.pts : []);
const span = (s: DraftShape, k: 'x' | 'y') => Math.max(...pts(s).map((p) => p[k])) - Math.min(...pts(s).map((p) => p[k]));
/** Where an arc's middle lies: the side of the wall it sweeps. */
const mid = (a: Extract<DraftShape, { type: 'arc' }>): Pt => {
  const m = (a.start + a.end) / 2 + (a.end < a.start ? Math.PI : 0);
  return { x: a.c.x + a.r * Math.cos(m), y: a.c.y + a.r * Math.sin(m) };
};

describe('REVOLVING_VERTICAL: one leaf pivoting about a vertical axis in its middle', () => {
  it('draws one leaf open across the opening through its middle, and the two quarter arcs its halves sweep, one to each side', () => {
    const { thin, heavy, dashed } = drawn('REVOLVING_VERTICAL');
    expect(heavy).toHaveLength(1);
    expect(span(heavy[0], 'y')).toBeCloseTo(W, 9);
    expect(span(heavy[0], 'x')).toBeLessThan(0.06);
    expect(thin.some((s) => s.type === 'circle')).toBe(false);
    const swept = arcs(thin);
    expect(swept).toHaveLength(2);
    for (const a of swept) {
      expect(a.c).toEqual(rect.c);
      expect(a.r).toBeCloseTo(W / 2, 9);
      expect((((a.end - a.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).toBeCloseTo(Math.PI / 2, 9);
    }
    expect(swept.map((a) => Math.sign(mid(a).y)).sort()).toEqual([-1, 1]);
    expect(swept.map((a) => Math.sign(mid(a).x)).sort()).toEqual([-1, 1]);
    expect(dashed).toHaveLength(0);
  });

  it('turns the other way with the hand flip: the half that swept to +Y sweeps to -Y', () => {
    const op = parseDoorOperation('REVOLVING_VERTICAL')!;
    const side = (flips: number) => arcs(doorSymbol(rect, flips, op).thin).map((a) => mid(a)).find((p) => p.y > 0)!.x;
    expect(Math.sign(side(0))).toBe(-Math.sign(side(1)));
  });

  it('leaves REVOLVING the four-leaf drum: a circle and a cross', () => {
    const { thin, heavy } = drawn('REVOLVING');
    expect(thin.filter((s) => s.type === 'circle')).toHaveLength(1);
    expect(heavy.filter((s) => s.type === 'line')).toHaveLength(2);
  });
});

describe('SWING_FIXED_*: one swinging leaf beside a fixed panel', () => {
  for (const [value, hingeX] of [['SWING_FIXED_LEFT', -W / 2], ['SWING_FIXED_RIGHT', W / 2]] as const) {
    it(`${value}: the leaf hinged on its jamb over half the opening, opening to +Y, and the fixed panel over the other half`, () => {
      const { thin, heavy } = drawn(value);
      const [arc] = arcs(thin);
      expect(arcs(thin)).toHaveLength(1);
      expect(arc.c.x).toBeCloseTo(hingeX, 9);
      expect(arc.r).toBeCloseTo(W / 2, 9);
      expect(mid(arc).y).toBeGreaterThan(0);
      const leaf = heavy.find((s) => span(s, 'y') > 0.1)!;
      expect(span(leaf, 'y')).toBeCloseTo(W / 2, 9);
      const fixed = heavy.filter((s) => s !== leaf);
      expect(fixed).toHaveLength(1);
      expect(span(fixed[0], 'x')).toBeCloseTo(W / 2, 9);
      // On the half away from the hinge.
      expect(Math.sign(pts(fixed[0]).reduce((sum, p) => sum + p.x, 0))).toBe(-Math.sign(hingeX));
    });
  }
});

describe('DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_*: the hand the enum\'s figures draw', () => {
  /** Each leaf's hinge x and the side (sign of y) its tip opens to, left leaf first. */
  const leaves = (value: string) => drawn(value).heavy.map((s) => ({ hinge: Math.sign(pts(s)[0].x), opens: Math.sign(pts(s)[1].y - pts(s)[0].y) }))
    .sort((a, b) => a.hinge - b.hinge);
  it('OPPOSITE_LEFT: the leaf on the -X jamb swings to -Y, the one on the +X jamb to +Y', () => {
    expect(leaves('DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_LEFT')).toEqual([{ hinge: -1, opens: -1 }, { hinge: 1, opens: 1 }]);
  });
  it('OPPOSITE_RIGHT: the leaf on the -X jamb swings to +Y, the one on the +X jamb to -Y', () => {
    expect(leaves('DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_RIGHT')).toEqual([{ hinge: -1, opens: 1 }, { hinge: 1, opens: -1 }]);
  });
});
