/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Symbols: building one from drawn shapes and placing it again gives the
 * shapes back (at any insertion point, scale, rotation and screen
 * direction); instances follow their definition; the built-in symbols are
 * well-formed; a symbol without its definition still has something to pick.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { entityBounds, entitySkeleton, setAnnotationScreenUp } from '@/drafting/annotation';
import { allSymbols, BUILT_IN_SYMBOLS, findSymbol, flattenShape, placeSymbol, setSymbolLibrary, symbolDrawingScale } from '@/drafting/symbols';
import type { DraftShape, EntityShape, Pt } from '@/drafting/types';
import { buildSymbolShapes } from './symbol-build.js';
import type { DraftSymbol } from './types.js';

const close = (a: Pt, b: Pt, tol = 1e-9) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < tol, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

const drawn: EntityShape[] = [
  { type: 'line', a: { x: 10, y: 20 }, b: { x: 14, y: 20 } },
  { type: 'polyline', pts: [{ x: 10, y: 20 }, { x: 12, y: 23 }, { x: 14, y: 20 }], closed: true },
  { type: 'circle', c: { x: 12, y: 21 }, r: 0.5 },
  { type: 'arc', c: { x: 12, y: 20 }, r: 2, start: 0.3, end: 1.9 },
  { type: 'text', p: { x: 11, y: 24 }, text: 'A', height: 0.25, rotation: 0.4 },
];

describe('building a symbol from shapes', () => {
  for (const up of [1, -1] as const) {
    it(`placing it back where it was gives the shapes back (screen up = ${up})`, () => {
      const origin = { x: 12, y: 20 };
      const { shapes, skipped } = buildSymbolShapes(drawn, origin, up, 1);
      assert.equal(skipped, 0);
      const def: DraftSymbol = { id: 's', name: 'S', unit: 'model', shapes };
      const placed = placeSymbol(def, { p: origin, scale: 1, rotation: 0 }, up);
      const [line, poly, circle, arc] = placed.geometry as [Extract<DraftShape, { type: 'line' }>, Extract<DraftShape, { type: 'polyline' }>, Extract<DraftShape, { type: 'circle' }>, Extract<DraftShape, { type: 'arc' }>];
      close(line.a, { x: 10, y: 20 });
      close(line.b, { x: 14, y: 20 });
      poly.pts.forEach((p, i) => close(p, (drawn[1] as typeof poly).pts[i]));
      close(circle.c, { x: 12, y: 21 });
      assert.ok(Math.abs(circle.r - 0.5) < 1e-9);
      close(arc.c, { x: 12, y: 20 });
      assert.ok(Math.abs(arc.start - 0.3) < 1e-9 && Math.abs(arc.end - 1.9) < 1e-9);
      close(placed.texts[0].p, { x: 11, y: 24 });
      assert.ok(Math.abs(placed.texts[0].rotation - 0.4) < 1e-9);
    });
  }

  it('moving the insertion point moves the instance, scaling scales it about the insertion point', () => {
    const { shapes } = buildSymbolShapes([{ type: 'line', a: { x: 1, y: 0 }, b: { x: 3, y: 0 } }], { x: 1, y: 0 }, 1, 1);
    const def: DraftSymbol = { id: 's', name: 'S', unit: 'model', shapes };
    const line = placeSymbol(def, { p: { x: 100, y: 50 }, scale: 2, rotation: Math.PI / 2 }, 1).geometry[0] as Extract<DraftShape, { type: 'line' }>;
    close(line.a, { x: 100, y: 50 });
    close(line.b, { x: 100, y: 54 });
  });

  it('a rotation turns counter-clockwise on screen whichever way the drawing\'s y runs', () => {
    const def: DraftSymbol = { id: 's', name: 'S', unit: 'model', shapes: [{ type: 'line', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }] };
    // Upright on the screen, a quarter turn counter-clockwise points the stroke screen-left.
    const upYUp = placeSymbol(def, { p: { x: 0, y: 0 }, scale: 1, rotation: Math.PI / 2 }, 1).geometry[0] as Extract<DraftShape, { type: 'line' }>;
    close(upYUp.b, { x: -1, y: 0 });
    const upYDown = placeSymbol(def, { p: { x: 0, y: 0 }, scale: 1, rotation: 0 }, -1).geometry[0] as Extract<DraftShape, { type: 'line' }>;
    close(upYDown.b, { x: 0, y: -1 });
    const turned = placeSymbol(def, { p: { x: 0, y: 0 }, scale: 1, rotation: Math.PI / 2 }, -1).geometry[0] as Extract<DraftShape, { type: 'line' }>;
    close(turned.b, { x: -1, y: 0 });
  });

  it('counts what cannot go into a symbol', () => {
    const { shapes, skipped } = buildSymbolShapes([...drawn, { type: 'level', p: { x: 0, y: 0 }, value: 1, height: 1 }, { type: 'hatch', loops: [], pattern: 'X', scale: 1, angle: 0 }], { x: 0, y: 0 }, 1, 1);
    assert.deepEqual([shapes.length, skipped], [5, 2]);
  });

  it('a paper symbol is built in millimetres', () => {
    const { shapes } = buildSymbolShapes([{ type: 'circle', c: { x: 0.1, y: 0 }, r: 0.4 }], { x: 0, y: 0 }, 1, 0.1);
    assert.deepEqual(shapes[0], { type: 'circle', c: { x: 1, y: 0 }, r: 4 });
  });
});

describe('instances follow the definition', () => {
  const instance = { type: 'symbol' as const, symbolId: 'mine', p: { x: 5, y: 5 }, scale: 1, rotation: 0 };
  it('the skeleton and bounds change when the definition does', () => {
    setAnnotationScreenUp(1);
    setSymbolLibrary([{ id: 'mine', name: 'Mine', unit: 'model', shapes: [{ type: 'line', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } }] }]);
    assert.deepEqual(entityBounds(instance), { min: { x: 5, y: 5 }, max: { x: 7, y: 5 } });
    setSymbolLibrary([{ id: 'mine', name: 'Mine', unit: 'model', shapes: [{ type: 'line', a: { x: 0, y: 0 }, b: { x: 0, y: 6 } }] }]);
    assert.deepEqual(entityBounds(instance), { min: { x: 5, y: 5 }, max: { x: 5, y: 11 } });
  });

  it('an instance whose symbol is gone is still something to pick', () => {
    setSymbolLibrary([]);
    const parts = entitySkeleton({ ...instance, symbolId: 'deleted' });
    assert.ok(parts.length > 0);
    const b = entityBounds({ ...instance, symbolId: 'deleted' });
    assert.ok(b.max.x > b.min.x);
  });

  it('text inside a symbol is part of its picking area', () => {
    setAnnotationScreenUp(1);
    setSymbolLibrary([{ id: 'mine', name: 'Mine', unit: 'paper', shapes: [{ type: 'text', p: { x: 0, y: 0 }, text: 'NORTH', height: 2, rotation: 0 }] }]);
    const b = entityBounds({ ...instance, scale: 1 });
    assert.ok(b.max.x - b.min.x > 5 && b.max.y - b.min.y > 1.5);
  });
});

describe('scale and units', () => {
  it('paper symbols are millimetres of paper, model symbols metres', () => {
    assert.equal(symbolDrawingScale({ unit: 'paper' }, 2, 0.1), 0.2);
    assert.equal(symbolDrawingScale({ unit: 'model' }, 2, 0.1), 2);
  });
});

describe('the built-in symbols', () => {
  it('ship four, with unique ids that a project cannot take, nothing outside the shapes a symbol may hold', () => {
    assert.equal(BUILT_IN_SYMBOLS.length, 4);
    assert.equal(new Set(BUILT_IN_SYMBOLS.map((s) => s.id)).size, 4);
    assert.ok(BUILT_IN_SYMBOLS.every((s) => s.id.startsWith('builtin:') && s.shapes.length > 0));
    assert.deepEqual(['north arrow', 'scale bar 5 m', 'centre line mark', 'tag bubble'], BUILT_IN_SYMBOLS.map((s) => s.name.toLowerCase()));
  });

  it('every one has a drawable extent, scale bar 5 m long', () => {
    setSymbolLibrary([]);
    for (const s of BUILT_IN_SYMBOLS) {
      const parts = placeSymbol(s, { p: { x: 0, y: 0 }, scale: 1, rotation: 0 }).geometry.flatMap((g) => flattenShape(g).pts);
      assert.ok(parts.length > 2, s.name);
    }
    const bar = placeSymbol(findSymbol('builtin:scale-bar')!, { p: { x: 0, y: 0 }, scale: 1, rotation: 0 }).geometry.flatMap((g) => flattenShape(g).pts);
    assert.equal(Math.max(...bar.map((p) => p.x)), 5);
  });

  it('are found by id, the project\'s own after them', () => {
    const own: DraftSymbol = { id: 'p1', name: 'Mine', unit: 'paper', shapes: [] };
    assert.equal(allSymbols([own]).length, 5);
    assert.equal(findSymbol('p1', [own])?.name, 'Mine');
    assert.equal(findSymbol('builtin:north-arrow', [])?.name, 'North arrow');
    assert.equal(findSymbol('nope', [own]), undefined);
  });
});

describe('flattening', () => {
  it('samples circles closed and arcs open, ending exactly on the arc\'s ends', () => {
    const c = flattenShape({ type: 'circle', c: { x: 0, y: 0 }, r: 2 }, 16);
    assert.equal(c.pts.length, 16);
    assert.ok(c.closed);
    c.pts.forEach((p) => assert.ok(Math.abs(Math.hypot(p.x, p.y) - 2) < 1e-9));
    const a = flattenShape({ type: 'arc', c: { x: 0, y: 0 }, r: 1, start: 0, end: Math.PI / 2 }, 16);
    close(a.pts[0], { x: 1, y: 0 });
    close(a.pts[a.pts.length - 1], { x: 0, y: 1 });
    assert.ok(!a.closed);
  });
});
