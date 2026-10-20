/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setTextMeasurer, tableWidthEm, textWidthEm } from './text-width.js';
import { textBlock } from './text-block.js';

afterEach(() => setTextMeasurer(undefined));

describe('textWidthEm without a canvas', () => {
  it('counts a narrow text narrower than a wide one of the same length', () => {
    assert.ok(textWidthEm('illli') < textWidthEm('WWWWW') / 2);
    assert.ok(textWidthEm('1.00') < textWidthEm('MMMM'));
  });
  it('sets mono fixed, bold wider and serif narrower than sans', () => {
    assert.equal(textWidthEm('iiii', { font: 'mono' }), textWidthEm('WWWW', { font: 'mono' }));
    assert.ok(textWidthEm('Wall', { bold: true }) > textWidthEm('Wall'));
    assert.ok(textWidthEm('Wall', { font: 'serif' }) < textWidthEm('Wall'));
  });
  it('an empty line has no width', () => assert.equal(textWidthEm(''), 0));
});

describe('a measurer', () => {
  it('is used when it answers, and the table when it does not', () => {
    setTextMeasurer((line) => line.length * 0.5);
    assert.equal(textWidthEm('abcd'), 2);
    setTextMeasurer(() => null);
    assert.equal(textWidthEm('abcd'), tableWidthEm('abcd'));
  });
  it('sizes the frame: the same padding either side of narrow and of wide text', () => {
    for (const text of ['il1', 'WMW MW']) {
      const b = textBlock(text, 1, 'box');
      assert.ok(b.frame?.kind === 'rect');
      const left = b.box.x0 - b.frame.x, right = b.frame.x + b.frame.w - b.box.x1;
      assert.ok(Math.abs(left - right) < 1e-9 && left > 0.3, `${text}: ${left} vs ${right}`);
      assert.ok(Math.abs(b.box.x1 - textWidthEm(text)) < 1e-9, 'the box is the measured width');
    }
  });
});
