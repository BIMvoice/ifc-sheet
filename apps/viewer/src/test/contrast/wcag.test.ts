/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRgba, compositeOver, relativeLuminance, contrastRatio, contrastOfTextOnSurface } from './wcag';

describe('wcag contrast math', () => {
  it('parses rgb() and rgba() as Chromium serializes them', () => {
    assert.deepEqual(parseRgba('rgb(255, 255, 255)'), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseRgba('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  });

  it('black on white is the maximum ratio, 21:1', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    assert.ok(Math.abs(contrastRatio(black, white) - 21) < 0.01);
  });

  it('identical colors give the minimum ratio, 1:1', () => {
    const c = { r: 130, g: 140, b: 150, a: 1 };
    assert.equal(contrastRatio(c, c), 1);
  });

  it('relative luminance is order-independent for contrastRatio (both directions equal)', () => {
    const a = { r: 200, g: 50, b: 50, a: 1 };
    const b = { r: 20, g: 20, b: 200, a: 1 };
    assert.equal(contrastRatio(a, b), contrastRatio(b, a));
  });

  it('compositeOver blends a translucent foreground toward the backdrop', () => {
    const halfBlackOnWhite = compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    assert.ok(Math.abs(halfBlackOnWhite.r - 127.5) < 0.01);
    assert.equal(halfBlackOnWhite.a, 1);
  });

  it('relativeLuminance(white) is 1 and relativeLuminance(black) is 0', () => {
    assert.ok(Math.abs(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 }) - 1) < 1e-9);
    assert.equal(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 }), 0);
  });

  it('opaque text equal to its surface is invisible (ratio 1) — sanity check for the non-compositing path', () => {
    const ratioOpaque = contrastOfTextOnSurface('rgb(20, 20, 30)', 'rgb(20, 20, 30)');
    assert.equal(ratioOpaque, 1);
  });

  it('contrastOfTextOnSurface composites alpha before measuring, using a translucent text color that DIFFERS from the surface so compositing and a naive (alpha-ignoring) measurement diverge', () => {
    // Near-white text at low alpha over a near-black surface: painted raw
    // (alpha ignored) this color reads as bright and high-contrast. Actually
    // composited at 12% alpha it blends mostly into the dark surface —
    // exactly the shape of #4783 (a translucent foreground that looks fine
    // as a bare className/string but is close to invisible once painted).
    const surface = { r: 20, g: 20, b: 30, a: 1 };
    const text = { r: 235, g: 235, b: 235, a: 0.12 };
    const surfaceCss = `rgb(${surface.r}, ${surface.g}, ${surface.b})`;
    const textCss = `rgba(${text.r}, ${text.g}, ${text.b}, ${text.a})`;

    // Expected value derived from the SAME already-unit-tested primitives
    // (compositeOver + contrastRatio), not a hand-duplicated formula — this
    // is an integration check that contrastOfTextOnSurface actually calls
    // compositeOver rather than a claim about the math itself.
    const expectedRatio = contrastRatio(compositeOver(text, surface), surface);
    const measuredRatio = contrastOfTextOnSurface(textCss, surfaceCss);
    assert.ok(
      Math.abs(measuredRatio - expectedRatio) < 1e-9,
      `expected contrastOfTextOnSurface to composite alpha before measuring: expected ${expectedRatio}, got ${measuredRatio}`,
    );

    // Non-vacuousness anchor: prove the fixture actually distinguishes
    // "composited" from "alpha ignored" by a wide margin. If compositeOver
    // were deleted (resolvedText falls back to the raw translucent color),
    // contrastOfTextOnSurface would jump to this naive ratio instead —
    // reddening the assertion above.
    const naiveRatio = contrastRatio(text, surface);
    assert.ok(
      naiveRatio - measuredRatio > 1,
      `fixture must diverge enough between composited (${measuredRatio}) and naive alpha-ignoring (${naiveRatio}) measurement to catch a deleted compositeOver call`,
    );
  });
});
