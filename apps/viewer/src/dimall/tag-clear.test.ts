/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A tag out in front of a facade is crossed by the extension lines of the strings (#638); it slides along the facade until
 * it is clear, keeping the element it points at, and nothing about a figure changes.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { textBox } from '@/drafting/annotation';
import type { DraftEntity, Pt } from '@/drafting/types';
import { house } from './fixture';
import { planDimensions } from './plan';
import { clearTags } from './tag-clear';

const H = 0.25;
const plan = planDimensions(house(), { paperUnit: 0.1, textHeight: H });
const tag = (id: string, p: Pt, leader?: Pt): DraftEntity => ({ id, viewId: 'v', layerId: 'l', shape: { type: 'text', p, text: 'W1', height: H, rotation: 0, frame: 'box', ...(leader ? { leader } : {}) }, params: {} });
const boxOf = (d: DraftEntity, dx = 0) => {
  const s = d.shape as Extract<DraftEntity['shape'], { type: 'text' }>;
  const c = textBox({ x: s.p.x + dx, y: s.p.y }, s.text, s.height, s.rotation, s.frame);
  return { x0: Math.min(...c.map((q) => q.x)), x1: Math.max(...c.map((q) => q.x)), y0: Math.min(...c.map((q) => q.y)), y1: Math.max(...c.map((q) => q.y)) };
};

/** The extension lines of the south facade, read in the test straight off the plan's strings: vertical at each measured x, from the face (y 0) out to the string. */
const south = plan.strings.filter((s) => s.outward.y < -0.5);
const crossed = (b: { x0: number; x1: number; y0: number; y1: number }): boolean =>
  south.some((s) => s.points.some((p) => p.x > b.x0 && p.x < b.x1 && b.y1 > Math.min(p.y, p.y + s.outward.y * s.offset) && b.y0 < Math.max(p.y, p.y + s.outward.y * s.offset)));

describe('a tag in front of a facade', () => {
  // Under the south window 5..7 the strings have lines at x 5 and 7 (the window's edges): a tag centred on 5.0, 0.6 below the face, is cut by one.
  const window5 = tag('w', { x: 4.8, y: -0.7 }, { x: 5.5, y: 0 });

  it('starts out crossed by an extension line', () => {
    assert.ok(south.length > 0);
    assert.ok(crossed(boxOf(window5)), 'the fixture tag is on a line');
  });

  it('slides along the facade to the nearest place clear of every line, and keeps its leader tip', () => {
    const moves = clearTags(plan, [window5], [], H);
    const next = moves.get('w');
    assert.ok(next && next.type === 'text');
    assert.deepEqual(next.leader, { x: 5.5, y: 0 }, 'the tip stays on the window');
    assert.equal(next.p.y, -0.7, 'it slides along the facade, not off it');
    const dx = next.p.x - 4.8;
    assert.ok(dx !== 0 && Math.abs(dx) < 1.5, `moved ${dx}`);
    assert.ok(!crossed(boxOf(window5, dx)), 'clear of every extension line');
    // The smallest move: one step less on that side is still crossed, with the clear margin a text keeps from a line (0.15 of its height).
    const less = boxOf(window5, dx > 0 ? dx - 0.05 : dx + 0.05), m = 0.15 * H;
    assert.ok(crossed({ x0: less.x0 - m, x1: less.x1 + m, y0: less.y0 - m, y1: less.y1 + m }), 'not further than it has to');
  });

  it('gives a tag that had no leader one, from its new place to where it stood', () => {
    const bare = tag('b', { x: 4.8, y: -0.7 });
    const next = clearTags(plan, [bare], [], H).get('b');
    assert.ok(next && next.type === 'text' && next.leader);
    const was = boxOf(bare);
    assert.deepEqual(next.leader, { x: (was.x0 + was.x1) / 2, y: (was.y0 + was.y1) / 2 });
  });

  it('leaves a tag no line crosses where it is', () => {
    const free = tag('f', { x: 5.2, y: -0.7 });
    assert.ok(!crossed(boxOf(free)));
    assert.equal(clearTags(plan, [free], [], H).size, 0);
  });

  it('does not slide onto what is already there: with both ways blocked it stays put', () => {
    const blocked = [{ x0: 5.1, y0: -1.2, x1: 20, y1: 0 }, { x0: -20, y0: -1.2, x1: 4.6, y1: 0 }];
    assert.equal(clearTags(plan, [window5], blocked, H).size, 0);
  });
});
