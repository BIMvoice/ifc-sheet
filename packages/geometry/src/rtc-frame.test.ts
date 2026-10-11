/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The federation-override rule, now that it has one home (#4611).
 *
 * `rtc-frame-every-path.test.ts` pins that all three WASM mesh paths answer
 * through this function; this file pins what the function answers.
 */

import { describe, expect, it } from 'vitest';
import { resolveRtcFrame } from './rtc-frame.js';

describe('resolveRtcFrame', () => {
  it('reports the detected offset when no federation offset is supplied', () => {
    expect(
      resolveRtcFrame({ rtcOffset: new Float64Array([10, 20, 30]), needsShift: true }),
    ).toEqual({ x: 10, y: 20, z: 30, needsShift: true });
  });

  it('lets a federation offset override the detected one', () => {
    expect(
      resolveRtcFrame(
        { rtcOffset: new Float64Array([10, 20, 30]), needsShift: true },
        { x: 100, y: 200, z: 300 },
      ),
    ).toEqual({ x: 100, y: 200, z: 300, needsShift: true });
  });

  it('forces needsShift under a federation offset even when the model detected none', () => {
    // The case the override exists for: a small model federated with a large
    // one. Its own pre-pass says "you are near the origin already, subtract
    // nothing", and honouring that beside a non-zero shared offset renders it
    // one federation offset away from every other model.
    expect(
      resolveRtcFrame(
        { rtcOffset: new Float64Array([0, 0, 0]), needsShift: false },
        { x: 100, y: 200, z: 300 },
      ),
    ).toEqual({ x: 100, y: 200, z: 300, needsShift: true });
  });

  it('reads a zero-vector federation offset as an override, not as absence', () => {
    // `{0,0,0}` is a legitimate shared origin (the federation anchor model sat
    // at the origin). A `!= null` test keeps it; a truthiness test would drop
    // it back to the model's own detected offset.
    expect(
      resolveRtcFrame(
        { rtcOffset: new Float64Array([10, 20, 30]), needsShift: true },
        { x: 0, y: 0, z: 0 },
      ),
    ).toEqual({ x: 0, y: 0, z: 0, needsShift: true });
  });

  it('reads a missing detected offset as the zero vector with no shift', () => {
    expect(resolveRtcFrame({})).toEqual({ x: 0, y: 0, z: 0, needsShift: false });
  });

  it('does not invent a shift from a detected offset the pre-pass did not apply', () => {
    expect(
      resolveRtcFrame({ rtcOffset: new Float64Array([10, 20, 30]), needsShift: false }),
    ).toEqual({ x: 10, y: 20, z: 30, needsShift: false });
  });
});
