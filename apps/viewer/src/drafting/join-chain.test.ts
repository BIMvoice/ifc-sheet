/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chainPieces, JOIN_TOLERANCE } from './join-chain';

const seg = (id: string, ax: number, ay: number, bx: number, by: number) => ({ id, pts: [{ x: ax, y: ay }, { x: bx, y: by }] });

describe('chainPieces (#668)', () => {
  it('joins lines end to end in order and flips the reversed one', () => {
    const chains = chainPieces([seg('a', 0, 0, 1, 0), seg('c', 2, 1, 1, 1), seg('b', 1, 0, 1, 1)]);
    assert.equal(chains.length, 1);
    assert.deepEqual(chains[0].ids, ['a', 'b', 'c']);
    assert.deepEqual(chains[0].pts, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    assert.equal(chains[0].closed, false);
  });
  it('extends at the head when a piece ends where the chain starts', () => {
    const [c] = chainPieces([seg('a', 1, 0, 2, 0), seg('b', 0, 0, 1, 0)]);
    assert.deepEqual(c.ids, ['b', 'a']);
    assert.equal(c.seed, 'a');
    assert.deepEqual(c.pts.map((p) => p.x), [0, 1, 2]);
  });
  it('closes a chain whose ends meet and drops the repeated point', () => {
    const [c] = chainPieces([seg('a', 0, 0, 1, 0), seg('b', 1, 0, 1, 1), seg('c', 1, 1, 0, 0)]);
    assert.equal(c.closed, true);
    assert.equal(c.pts.length, 3);
  });
  it('joins ends within the tolerance and leaves pieces a larger gap apart', () => {
    assert.equal(chainPieces([seg('a', 0, 0, 1, 0), seg('b', 1 + JOIN_TOLERANCE / 2, 0, 2, 0)]).length, 1);
    assert.deepEqual(chainPieces([seg('a', 0, 0, 1, 0), seg('b', 1.01, 0, 2, 0)]).map((c) => c.ids), [['a'], ['b']]);
  });
  it('takes an open polyline as a piece', () => {
    const [c] = chainPieces([{ id: 'p', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }, seg('l', 1, 1, 0, 1)]);
    assert.equal(c.pts.length, 4);
  });
});
