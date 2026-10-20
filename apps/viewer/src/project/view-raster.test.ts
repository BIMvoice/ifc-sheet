/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captureViewRaster, coverCrop, deliveredSize } from '@/lib/export/view-raster-capture';
import type { CameraViewpoint } from '@/store/types';
import { presetViewDirection } from './axonometric.js';
import type { AxonometricPreset, ThreeDProjectView } from './types';
import { effectiveDpi, rasterFits, rasterRequest } from './view-raster.js';

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

describe('the camera a capture is taken from (PR #130 review)', () => {
  const BOUNDS = { min: { x: -10, y: 0, z: -4 }, max: { x: 10, y: 6, z: 4 } };
  /** What the 3D view shows at the time: looking straight down, which no preset is. */
  const ON_SCREEN: CameraViewpoint = { position: { x: 0, y: 50, z: 0.001 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 }, fov: Math.PI / 4, projectionMode: 'perspective' };
  async function asked(view: Partial<ThreeDProjectView>): Promise<CameraViewpoint> {
    const full: ThreeDProjectView = { id: 'v', name: 'V', kind: '3d', viewpoint: null, ...view } as ThreeDProjectView;
    let seen: CameraViewpoint | null = null;
    await captureViewRaster(full, { width: 150, height: 100 }, {
      modelBounds: () => BOUNDS,
      capture: async (vp, w, h) => { seen = vp; return { href: 'data:image/png;base64,AAAA', widthPx: w, heightPx: h }; },
    });
    assert.ok(seen, 'a camera was asked for');
    return seen;
  }
  const direction = (vp: CameraViewpoint) => {
    const d = { x: vp.target.x - vp.position.x, y: vp.target.y - vp.position.y, z: vp.target.z - vp.position.z };
    const n = Math.hypot(d.x, d.y, d.z);
    return [d.x / n, d.y / n, d.z / n];
  };
  const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  const dirOf = (p: AxonometricPreset) => { const d = presetViewDirection(p); return [d.x, d.y, d.z]; };

  it('is the preset corner for an axonometric with no saved camera, looking at the model, orthographic', async () => {
    for (const preset of ['se', 'nw'] as const) {
      const vp = await asked({ projection: 'axonometric', preset, shaded: true });
      assert.ok(close(direction(vp), dirOf(preset)), `${preset}: ${direction(vp)}`);
      assert.deepEqual(vp.target, { x: 0, y: 3, z: 0 }, 'the centre of the model');
      assert.equal(vp.projectionMode, 'orthographic');
      assert.ok((vp.orthoSize ?? 0) >= Math.hypot(20, 6, 8) / 2, 'the whole model fits');
    }
  });

  it('is the preset corner even when a saved camera looks elsewhere, as the vector drawing is', async () => {
    const vp = await asked({ projection: 'axonometric', preset: 'se', shaded: true, viewpoint: ON_SCREEN });
    assert.ok(close(direction(vp), dirOf('se')));
  });

  it('is the default corner for a perspective with no saved camera, never what the screen shows', async () => {
    const vp = await asked({ projection: 'perspective' });
    assert.ok(close(direction(vp), dirOf('se')));
    assert.equal(vp.projectionMode, 'perspective');
  });

  it('is the saved camera of a perspective', async () => {
    assert.deepEqual(await asked({ projection: 'perspective', viewpoint: ON_SCREEN }), ON_SCREEN);
  });
});

describe('the resolution a capture really has (PR #130 review)', () => {
  it('is never enlarged to the request: a smaller canvas is delivered at its own pixels', () => {
    // A 400 x 250 mm box asks for 4725 x 2953 px; a 1600 x 1000 canvas crops to 1600 x 1000.
    const want = rasterRequest(400, 250);
    const c = coverCrop(1600, 1000, want.widthPx, want.heightPx);
    assert.deepEqual(deliveredSize(c.width, c.height, want.widthPx, want.heightPx), { widthPx: 1600, heightPx: 1000 });
    // A canvas larger than the request is reduced to it.
    assert.deepEqual(deliveredSize(4000, 2000, 1772, 886), { widthPx: 1772, heightPx: 886 });
  });

  it('is reported as the dpi on paper, about 100 for the 400 x 250 mm box the review measured, and 300 only when delivered', () => {
    assert.equal(effectiveDpi({ widthPx: 1600, heightPx: 1000, widthMm: 400, heightMm: 250 }), 101);
    const full = rasterRequest(150, 100);
    assert.equal(effectiveDpi({ widthPx: full.widthPx, heightPx: full.heightPx, widthMm: 150, heightMm: 100 }), 300);
    // The lower axis decides.
    assert.equal(effectiveDpi({ widthPx: 1772, heightPx: 591, widthMm: 150, heightMm: 100 }), 150);
  });

  it('is recorded as delivered, not as requested', async () => {
    const raster = await captureViewRaster({ id: 'v', name: 'V', kind: '3d', createdAt: 0, viewpoint: null, projection: 'perspective' }, { width: 400, height: 250 }, {
      modelBounds: () => ({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }),
      capture: async () => ({ href: 'data:image/png;base64,AAAA', widthPx: 1600, heightPx: 1000 }),
    });
    assert.deepEqual([raster.widthPx, raster.heightPx, effectiveDpi(raster)], [1600, 1000, 101]);
  });
});
