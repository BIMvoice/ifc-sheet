/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A room tag too big for its room keeps off the texts already drawn (found while fixing #557, PR #779). */

import { describe, expect, it } from 'vitest';
import { pointInRing, rectAround, rectHitsRing } from '../labels/label-geometry.js';
import { RectIndex } from '../labels/rect-index.js';
import { roomLabelSpill } from './room-spill.js';

const room = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.6 }, { x: 0, y: 0.6 }];
const deepest = { x: 0.5, y: 0.3 };

describe('roomLabelSpill', () => {
  it('stays at the deepest point when nothing is drawn there', () => {
    const spill = roomLabelSpill(room, 2, 0.4, deepest, new RectIndex(1), 0.02);
    expect(spill?.centre).toEqual(deepest);
    expect(spill?.tip).toBeUndefined();
  });
  it('moves clear of a text on the deepest point and still touches the room', () => {
    const texts = new RectIndex(1);
    const note = rectAround(deepest, 0.6, 0.15);
    texts.add(note);
    const spill = roomLabelSpill(room, 2, 0.4, deepest, texts, 0.02);
    expect(spill).not.toBeNull();
    expect(texts.any(rectAround(spill!.centre, 2, 0.4))).toBe(false);
    // Over the room's edge, so that no leader is needed.
    const r = rectAround(spill!.centre, 2, 0.4);
    expect(r.x1 > 0 && r.x0 < 1 && r.y1 > 0 && r.y0 < 0.6).toBe(true);
    expect(spill!.tip === undefined || pointInRing(room, spill!.tip)).toBe(true);
  });

  // Review of #557's PR: the spill ignored the detail crop, and a tag moved onto a cut wall.
  it('keeps the whole tag inside the crop of a detail', () => {
    // A room cut by the crop to 0.6 m by 0.6 m, with a note over its middle: every clear place for the tag lies over the crop's edge.
    const crop = { min: { x: 0, y: 0 }, max: { x: 0.6, y: 0.6 } };
    const cut = [{ x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.6, y: 0.6 }, { x: 0, y: 0.6 }];
    const texts = new RectIndex(1);
    texts.add(rectAround({ x: 0.3, y: 0.3 }, 0.4, 0.5));
    const without = roomLabelSpill(cut, 0.4, 0.2, { x: 0.3, y: 0.3 }, texts, 0.02);
    const o = rectAround(without!.centre, 0.4, 0.2);
    expect(o.x0 < crop.min.x || o.x1 > crop.max.x || o.y0 < crop.min.y || o.y1 > crop.max.y, 'unlimited, the nearest clear place is clipped').toBe(true);
    const spill = roomLabelSpill(cut, 0.4, 0.2, { x: 0.3, y: 0.3 }, texts, 0.02, { crop });
    // The only clear places that touch the room lie over the crop's edge, so none is taken: the tag stays where it was, whole in the crop.
    expect(spill).toBeNull();
  });
  it('does not put a moved tag over a cut wall', () => {
    const texts = new RectIndex(1);
    texts.add(rectAround(deepest, 0.6, 0.15));
    // A wall band across the room's lower part: the nearest clear place (the lower one, on a tie) lies over it.
    const wall = [{ x: -1, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 0.25 }, { x: -1, y: 0.25 }];
    const walls = new RectIndex<readonly { x: number; y: number }[]>(1);
    walls.add({ x0: -1, y0: -1, x1: 2, y1: 0.25 }, wall);
    const spill = roomLabelSpill(room, 0.5, 0.2, deepest, texts, 0.02, { walls });
    expect(spill).not.toBeNull();
    expect(rectHitsRing(rectAround(spill!.centre, 0.5, 0.2), wall)).toBe(false);
    const free = roomLabelSpill(room, 0.5, 0.2, deepest, texts, 0.02);
    expect(rectHitsRing(rectAround(free!.centre, 0.5, 0.2), wall), 'without the walls the nearest place is over the wall').toBe(true);
  });
  it('is the nearest clear place, whichever ring it lies in, and the same on every run', () => {
    const texts = new RectIndex(1);
    texts.add(rectAround(deepest, 0.6, 0.15));
    const a = roomLabelSpill(room, 0.5, 0.2, deepest, texts, 0.02);
    const b = roomLabelSpill(room, 0.5, 0.2, deepest, texts, 0.02);
    expect(a).toEqual(b);
    const d = Math.hypot(a!.centre.x - deepest.x, a!.centre.y - deepest.y);
    // No clear place on a fine grid lies nearer than the one found (to within a grid step).
    for (let y = 0; y <= 0.6; y += 0.01) for (let x = 0; x <= 1; x += 0.01) {
      if (!texts.any(rectAround({ x, y }, 0.54, 0.24))) expect(Math.hypot(x - deepest.x, y - deepest.y)).toBeGreaterThanOrEqual(d - 0.05);
    }
  });
});
