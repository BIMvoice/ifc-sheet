/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The 3D render loop's adaptive cadence cap, moved out of `useAnimationLoop.ts` unchanged. */

export interface RenderThrottle {
  /** Minimum ms between continuous-render frames; 0 = no throttle. */
  readonly ms: number;
  /** Feed the wall time of a frame that rendered. */
  update(renderMs: number): void;
}

export function createRenderThrottle(): RenderThrottle {
  // Adaptive render throttle: cap the continuous-render cadence (interaction
  // + inertia) from the MEASURED cost of recent renders, not a triangle-count
  // guess. The old tiers (25ms above 1M triangles, 33ms above 5M) capped
  // orbiting at 40/30 fps even when frames were cheap — culling means a 6M-
  // triangle model can render in a few ms, and the cap itself was the
  // choppiness on CATIA-class models. renderer.render() wall time covers
  // encoder work AND swap-chain backpressure (getCurrentTexture blocks when
  // the GPU falls behind), so genuinely heavy scenes still degrade to the
  // same 40/30 fps floors within a few frames; a 200K-mesh model that takes
  // 30ms a frame cannot overwhelm the main thread any more than before.
  let continuousThrottleMs = 0; // 0 = no throttle
  let emaRenderMs = 0;          // EMA of render() wall time, rendered frames only

  return {
    get ms() { return continuousThrottleMs; },
    update(renderMs: number) {
      emaRenderMs = emaRenderMs === 0 ? renderMs : renderMs * 0.2 + emaRenderMs * 0.8;
      // Hysteresis ladder — engage above, release below, hold in between,
      // so the cadence doesn't flap around a band edge mid-gesture.
      if (emaRenderMs >= 26) {
        continuousThrottleMs = 33; // ~30 fps
      } else if (emaRenderMs >= 14) {
        if (continuousThrottleMs !== 33 || emaRenderMs < 20) {
          continuousThrottleMs = 25; // ~40 fps
        }
      } else if (emaRenderMs <= 10) {
        continuousThrottleMs = 0;
      }
    },
  };
}
