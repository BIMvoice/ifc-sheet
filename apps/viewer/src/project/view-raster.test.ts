/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coverCrop } from '@/lib/export/view-raster-capture';
import { rasterFits, rasterRequest } from './view-raster.js';

describe('the size of a viewport capture (issue #49)', () => {
  it('is the box in millimetres at 300 dpi, rounded up to a whole pixel', () => {
    const fit = rasterRequest(150, 100);
    assert.deepEqual([fit.widthPx, fit.heightPx, fit.capped], [1772, 1182, false]);
    assert.deepEqual([rasterRequest(25.4, 25.4).widthPx, rasterRequest(25.4, 25.4).heightPx], [300, 300]);
  });

  it('is reduced, aspect kept, when the box would be larger than a raster can be', () => {
    const fit = rasterRequest(1189, 841); // an A0 viewport at 300 dpi is 14043 x 9933 px
    assert.equal(fit.capped, true);
    assert.ok(fit.widthPx * fit.heightPx <= 16_777_216);
    assert.ok(Math.abs(fit.widthPx / fit.heightPx - 1189 / 841) < 0.01);
  });

  it('is stale once the box is resized: the stored capture no longer fits it', () => {
    const raster = { href: 'data:,', widthPx: 1772, heightPx: 1182, widthMm: 150, heightMm: 100 };
    assert.equal(rasterFits(raster, { width: 150, height: 100 }), true);
    assert.equal(rasterFits(raster, { width: 150, height: 120 }), false);
    assert.equal(rasterFits(null, { width: 150, height: 100 }), false);
  });
});

describe('cropping a canvas to a viewport box', () => {
  it('takes the largest centred rectangle of the box aspect, never stretching', () => {
    assert.deepEqual(coverCrop(1600, 900, 150, 100), { x: 125, y: 0, width: 1350, height: 900 });
    const c = coverCrop(1000, 1000, 150, 100);
    assert.deepEqual([c.x, c.width], [0, 1000]);
    assert.ok(Math.abs(c.height - 1000 / 1.5) < 1e-9 && Math.abs(c.y - (1000 - c.height) / 2) < 1e-9);
  });
});
