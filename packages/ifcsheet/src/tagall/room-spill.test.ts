/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A room tag too big for its room keeps off the texts already drawn (found while fixing #557, PR #779). */

import { describe, expect, it } from 'vitest';
import { pointInRing, rectAround } from '../labels/label-geometry.js';
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
});
