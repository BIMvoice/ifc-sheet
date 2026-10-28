/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Where a snapped dimension point sits on its element, in terms that survive the element being made longer. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorOf, anchorsOf, decodeAnchor, encodeAnchor, shiftOf } from './dimension-anchor.js';
import { newDraft } from './draft-store.js';

const wall = { guid: 'W', rect: { x0: 7.41, y0: -4.25, x1: 11.7, y1: -4.01 } };

describe('anchorOf', () => {
  it('describes a corner by its sides, an edge middle by the middle, and nothing else', () => {
    assert.deepEqual([anchorOf({ x: 11.7, y: -4.01 }, wall)!.x[0], anchorOf({ x: 11.7, y: -4.01 }, wall)!.y[0]], ['max', 'max']);
    assert.deepEqual([anchorOf({ x: 7.41, y: -4.25 }, wall)!.x[0], anchorOf({ x: 7.41, y: -4.25 }, wall)!.y[0]], ['min', 'min']);
    const midEdge = anchorOf({ x: (7.41 + 11.7) / 2, y: -4.01 }, wall)!;
    assert.deepEqual([midEdge.x[0], midEdge.y[0]], ['mid', 'max']);
    assert.equal(anchorOf({ x: 9, y: -4.1 }, wall), null, 'inside the box');
    assert.equal(anchorOf({ x: 9, y: -4.01 }, wall), null, 'on an edge but nowhere in particular: a turned element\'s extreme vertex looks like this');
    assert.equal(anchorOf({ x: 12.5, y: -4.01 }, wall), null, 'off the box');
  });
  it('keeps the distance from the side it is on', () => {
    assert.ok(Math.abs(anchorOf({ x: 11.703, y: -4.01 }, wall)!.x[1] - 0.003) < 1e-9);
  });
});

describe('shiftOf', () => {
  const lengthened = { ...wall.rect, x1: 12.2 };
  it('moves the end that is on the lengthened side and not the other', () => {
    const east = anchorOf({ x: 11.7, y: -4.01 }, wall)!;
    const west = anchorOf({ x: 7.41, y: -4.01 }, wall)!;
    assert.deepEqual(shiftOf(east, wall.rect, lengthened), { x: 0.5, y: 0 });
    assert.deepEqual(shiftOf(west, wall.rect, lengthened), { x: 0, y: 0 });
  });
  it('moves a middle by half', () => {
    const mid = anchorOf({ x: (7.41 + 11.7) / 2, y: -4.01 }, wall)!;
    assert.ok(Math.abs(shiftOf(mid, wall.rect, lengthened).x - 0.25) < 1e-9);
  });
  it('follows a move of the whole box', () => {
    const c = anchorOf({ x: 11.7, y: -4.25 }, wall)!;
    const s = shiftOf(c, wall.rect, { x0: 8.41, y0: -5.25, x1: 12.7, y1: -5.01 });
    assert.ok(Math.abs(s.x - 1) < 1e-9 && Math.abs(s.y + 1) < 1e-9);
  });
});

describe('the param', () => {
  const anchor = { ...anchorOf({ x: 11.7, y: -4.01 }, wall)!, r: [1, 2, 3, 4] as const };
  it('reads back as written', () => assert.deepEqual(decodeAnchor(encodeAnchor(anchor)), anchor));
  it('refuses what is not one', () => {
    for (const bad of [undefined, 3, '', '{', '{"g":"W"}', JSON.stringify({ ...anchor, x: ['top', 0] }), JSON.stringify({ ...anchor, p: [1] }), JSON.stringify({ ...anchor, g: '' })]) assert.equal(decodeAnchor(bad), null, String(bad));
  });
  it('is read from a dimension and from nothing else', () => {
    const shape = { type: 'dimension' as const, variant: 'aligned' as const, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, at: { x: 0, y: 1 }, height: 0.25 };
    assert.deepEqual(anchorsOf(newDraft('v', 'l', shape, { anchorB: encodeAnchor(anchor) })).map((x) => x.param), ['anchorB']);
    assert.deepEqual(anchorsOf(newDraft('v', 'l', { type: 'text', p: { x: 0, y: 0 }, text: 'x', height: 0.25, rotation: 0 }, { anchorA: encodeAnchor(anchor) })), []);
    assert.deepEqual(anchorsOf(newDraft('v', 'l', shape, { anchorA: 'junk' })), []);
  });
});
