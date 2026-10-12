/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { entityBounds, setAnnotationScreenUp, textBox } from './annotation.js';
import { readDraft } from './draft-file.js';
import type { DraftEntity } from './types.js';
import { asTextFrame, LINE_PITCH, textBlock } from './text-block.js';
import { tableWidthEm } from './text-width.js';

const near = (a: number, b: number, why = '') => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b} ${why}`);

describe('textBlock', () => {
  it('breaks lines at a line break, one pitch apart', () => {
    const b = textBlock('Wall\nEI 60\n4.29 m', 0.2);
    assert.deepEqual(b.lines.map((l) => l.text), ['Wall', 'EI 60', '4.29 m']);
    near(b.lines[2].y, 2 * LINE_PITCH * 0.2);
    near(b.box.x1, 0.2 * tableWidthEm('4.29 m'), 'the widest line sets the width');
  });
  it('has no outline without a frame, and its box is the picking box', () => {
    const b = textBlock('A', 1);
    assert.equal(b.frame, null);
    assert.deepEqual(b.outer, b.box);
  });
  it('wraps the text in a box or a rounded box with room round it', () => {
    const box = textBlock('Wall', 1, 'box');
    assert.ok(box.frame?.kind === 'rect' && box.frame.radius === 0);
    const rounded = textBlock('Wall', 1, 'rounded');
    assert.ok(rounded.frame?.kind === 'rect' && rounded.frame.radius > 0);
    assert.ok(box.frame.x < 0 && box.frame.x + box.frame.w > box.box.x1, 'the frame clears the text on both sides');
    assert.ok(box.frame.y < -0.72 && box.frame.y + box.frame.h > 0.25, 'and above and below');
  });
  it('a bubble holds the whole text: a circle for a short tag, an ellipse for a long one', () => {
    const tag = textBlock('W1', 1, 'bubble');
    assert.ok(tag.frame?.kind === 'ellipse' && tag.frame.rx === tag.frame.ry);
    const long = textBlock('Fire wall EI 60\nlevel 1', 1, 'bubble');
    assert.ok(long.frame?.kind === 'ellipse' && long.frame.rx > long.frame.ry);
    for (const b of [tag, long]) {
      const e = b.frame;
      assert.ok(e?.kind === 'ellipse');
      for (const [x, y] of [[b.box.x0, -0.72], [b.box.x1, -0.72], [b.box.x0, b.lines.at(-1)!.y + 0.22], [b.box.x1, b.lines.at(-1)!.y + 0.22]]) {
        const inside: number = ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2;
        assert.ok(inside <= 1 + 1e-9, `corner ${x},${y} is inside the bubble`);
      }
    }
  });
});

describe('a text with lines and a frame in the drawing', () => {
  it('is picked and bounded by its whole block, downward from the anchor on a y-up drawing', () => {
    setAnnotationScreenUp(1);
    const single = entityBounds({ type: 'text', p: { x: 0, y: 0 }, text: 'Wall', height: 0.25, rotation: 0 });
    near(single.min.y, 0);
    near(single.max.y, 0.25);
    const multi = entityBounds({ type: 'text', p: { x: 0, y: 0 }, text: 'Wall\nEI 60', height: 0.25, rotation: 0 });
    near(multi.max.y, 0.25);
    near(multi.min.y, -LINE_PITCH * 0.25);
    const framed = entityBounds({ type: 'text', p: { x: 0, y: 0 }, text: 'Wall', height: 0.25, rotation: 0, frame: 'box' });
    assert.ok(framed.min.x < 0 && framed.max.x > single.max.x && framed.max.y > single.max.y);
  });
  it('runs the other way on a y-down drawing', () => {
    setAnnotationScreenUp(-1);
    const box = textBox({ x: 0, y: 0 }, 'A\nB', 1, 0);
    setAnnotationScreenUp(1);
    assert.ok(box.every((c) => c.y >= -1 && c.y <= LINE_PITCH) && box.some((c) => c.y > 1));
  });
});

describe('a stored frame', () => {
  const draft = (frame?: unknown): DraftEntity => readDraft({ id: 'd', viewId: 'v', layerId: '0', params: {}, shape: { type: 'text', p: { x: 0, y: 0 }, text: 'A\nB', height: 0.25, rotation: 0, ...(frame === undefined ? {} : { frame }) } }, '/drafts/0');
  it('is read back with its line break', () => {
    const d = draft('rounded');
    assert.ok(d.shape.type === 'text' && d.shape.frame === 'rounded' && d.shape.text === 'A\nB');
  });
  it('is absent in an old project and refused when it names no frame', () => {
    const d = draft();
    assert.ok(d.shape.type === 'text' && !('frame' in d.shape));
    assert.throws(() => draft('hexagon'), /frame/);
    assert.equal(asTextFrame('bubble'), 'bubble');
    assert.equal(asTextFrame('none'), undefined);
  });
});
