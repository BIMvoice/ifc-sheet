/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DWELL_MS, EMPTY_TRACK, MAX_ACQUIRED, hover, nearLines, tick, trackSnap, type TrackState } from './tracking';
import { TRACKING_KEY, setTracking, toggleTracking, useTrackingPref } from './tracking-pref';

const corner = { x: 4, y: 3 };

function acquire(state: TrackState, at: { x: number; y: number }, t0 = 0): TrackState {
  return tick(hover(state, at, t0), t0 + DWELL_MS);
}

describe('acquiring a point (#667)', () => {
  it('needs the cursor to rest on a corner for the dwell time', () => {
    const resting = hover(EMPTY_TRACK, corner, 0);
    assert.deepEqual(tick(resting, DWELL_MS - 1).acquired, []);
    assert.deepEqual(tick(resting, DWELL_MS).acquired, [corner]);
  });

  it('forgets a corner the cursor left before the dwell time', () => {
    const left = hover(hover(EMPTY_TRACK, corner, 0), null, 100);
    assert.deepEqual(tick(left, 10_000).acquired, []);
  });

  it('does not let the point go again while the cursor still rests on it', () => {
    const once = acquire(EMPTY_TRACK, corner);
    const still = tick(hover(once, corner, 1000), 5000);
    assert.deepEqual(still.acquired, [corner]);
  });

  it('lets an acquired point go when the cursor rests on it a second time', () => {
    const once = acquire(EMPTY_TRACK, corner);
    const away = hover(once, null, 1000);
    assert.deepEqual(acquire(away, corner, 2000).acquired, []);
  });

  it('keeps the newest points when more than the limit are acquired', () => {
    let s: TrackState = EMPTY_TRACK;
    for (let i = 0; i <= MAX_ACQUIRED; i++) s = acquire(hover(s, null, i * 1000), { x: i, y: i }, i * 1000 + 1);
    assert.equal(s.acquired.length, MAX_ACQUIRED);
    assert.deepEqual(s.acquired[0], { x: 1, y: 1 });
  });
});

describe('snapping to tracking lines', () => {
  it('puts a point in line with the corner, horizontally and vertically', () => {
    assert.deepEqual(trackSnap({ x: 9, y: 3.04 }, [corner], 0.1)?.point, { x: 9, y: 3 });
    assert.deepEqual(trackSnap({ x: 4.05, y: -7 }, [corner], 0.1)?.point, { x: 4, y: -7 });
  });

  it('does nothing when the cursor is farther than the tolerance from every line', () => {
    assert.equal(trackSnap({ x: 9, y: 3.5 }, [corner], 0.1), null);
    assert.equal(trackSnap({ x: 9, y: 3 }, [], 0.1), null);
  });

  it('snaps to where the lines of two acquired points cross', () => {
    const r = trackSnap({ x: 10.03, y: 3.02 }, [corner, { x: 10, y: 20 }], 0.1);
    assert.deepEqual(r?.point, { x: 10, y: 3 });
    assert.equal(r?.active.length, 2);
  });

  it('lines up along the ortho direction when ortho is on, keeping the line horizontal', () => {
    // From a base at y = 0, drawing rightwards; the corner's vertical meets the horizontal at x = 4.
    const r = trackSnap({ x: 4.05, y: 0.4 }, [corner], 0.2, { base: { x: 0, y: 0 }, ortho: true });
    assert.deepEqual(r?.point, { x: 4, y: 0 });
  });

  it('does not pull a point off the ortho line onto a line that crosses nowhere near it', () => {
    assert.equal(trackSnap({ x: 9, y: 0.01 }, [corner], 0.2, { base: { x: 0, y: 0 }, ortho: true }), null);
  });

  it('draws the lines the cursor is close to, not every one', () => {
    const lines = nearLines([corner], { x: 4.02, y: 50 }, 0.5);
    assert.deepEqual(lines, [{ from: corner, dir: 'v' }]);
  });
});

describe('the on/off choice', () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) },
    });
    useTrackingPref.setState({ on: true });
  });

  it('is on by default and remembered when turned off', async () => {
    assert.equal(useTrackingPref.getState().on, true);
    toggleTracking();
    assert.equal(useTrackingPref.getState().on, false);
    assert.equal(data.get(TRACKING_KEY), 'off');
    // A fresh load of the app reads the choice back.
    const fresh = await import(`./tracking-pref?reload=${Date.now()}`);
    assert.equal(fresh.useTrackingPref.getState().on, false);
    setTracking(true);
    assert.equal(data.get(TRACKING_KEY), 'on');
  });
});
