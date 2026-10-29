/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #449: the detail level, line identity and hidden lines of a joinery type's views, on hand-made lines whose answers are worked out here. */
import { describe, expect, it } from 'vitest';
import { defaultWindowSpec } from '@ifc-lite/create';
import { readJoinerySpec } from './joinery-spec-read.js';
import {
  joineryViewLineId, joineryViewLines, withHiddenLinesShown, withViewDetail, withViewLineHidden, type JoineryViewLineLike,
} from './joinery-view-detail.js';

// The default window: frame 60 mm, sash 70 mm, so "small" is 30 mm.
const spec = { ...defaultWindowSpec('W'), id: 'w1' };
const L = (ax: number, ay: number, bx: number, by: number, kind = 'cut'): JoineryViewLineLike => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, kind });
// A 1.2 x 1.5 front: the box, a mullion, a 20 mm bead, and hatching.
const box = [L(-0.6, 0, 0.6, 0), L(0.6, 0, 0.6, 1.5), L(0.6, 1.5, -0.6, 1.5), L(-0.6, 1.5, -0.6, 0)];
const mullion = L(-0.04, 0.06, -0.04, 1.44);
const bead = L(-0.3, 0.6, -0.3, 0.62, 'seen');
const hatch = L(-0.59, 0.1, -0.55, 0.14, 'hatch');
const all = [...box, mullion, bead, hatch];

describe('line identity', () => {
  it('is the rounded end points in millimetres, the lesser end first, whichever way the line runs', () => {
    expect(joineryViewLineId('front', { x: 0.0404, y: 1.44 }, { x: 0.0404, y: 0.06 })).toBe('front:40,60,40,1440');
    expect(joineryViewLineId('front', { x: 0.0404, y: 0.06 }, { x: 0.0404, y: 1.44 })).toBe('front:40,60,40,1440');
    expect(joineryViewLineId('plan', { x: -0.0004, y: 0 }, { x: 0.1, y: 0 })).toBe('plan:0,0,100,0');
  });
});

describe('detail level', () => {
  it('everything keeps all of it, hatching included', () => {
    expect(joineryViewLines('front', all, withViewDetail(spec, 'all'))).toEqual(all);
    expect(joineryViewLines('front', all, spec)).toEqual(all);
  });
  it('frame and leaves drops what is smaller than half a member (the bead) and keeps members and hatching', () => {
    expect(joineryViewLines('front', all, withViewDetail(spec, 'frame'))).toEqual([...box, mullion, hatch]);
  });
  it('outline only keeps the lines on the view\'s box and no hatching', () => {
    expect(joineryViewLines('front', all, withViewDetail(spec, 'outline'))).toEqual(box);
  });
});

describe('hidden lines', () => {
  const id = joineryViewLineId('front', mullion.a, mullion.b);
  it('hides that line only, at every level, and shows it again', () => {
    const hidden = withViewLineHidden(spec, id);
    expect(joineryViewLines('front', all, hidden)).toEqual(all.filter((l) => l !== mullion));
    expect(joineryViewLines('front', all, withViewDetail(hidden, 'frame'))).toEqual([...box, hatch]);
    expect(joineryViewLines('plan', all, hidden)).toEqual(all);
    expect(joineryViewLines('front', all, withHiddenLinesShown(hidden))).toEqual(all);
  });
  it('a hidden run hides the pieces the cutter later returns for it, but a hidden piece does not hide the longer run', () => {
    const run = withViewLineHidden(spec, joineryViewLineId('plan', { x: -0.54, y: -0.1 }, { x: 0.54, y: -0.1 }));
    const pieces = [L(-0.54, -0.1, -0.054, -0.1), L(0.054, -0.1, 0.54, -0.1), L(-0.54, 0.1, 0.54, 0.1)];
    expect(joineryViewLines('plan', pieces, run)).toEqual([pieces[2]]);
    const piece = withViewLineHidden(spec, joineryViewLineId('plan', pieces[0].a, pieces[0].b));
    expect(joineryViewLines('plan', [L(-0.54, -0.1, 0.54, -0.1)], piece)).toHaveLength(1);
  });
  it('clearing the choice leaves no field in the spec', () => {
    expect(withHiddenLinesShown(withViewLineHidden(spec, id)).view).toBeUndefined();
    expect(withViewDetail(withViewLineHidden(spec, id), 'outline').view).toEqual({ detail: 'outline', hidden: [id] });
  });
});

describe('the stored choice', () => {
  it('is read back from the project, and a bad level or id is dropped', () => {
    const chosen = withViewDetail(withViewLineHidden(spec, 'front:40,60,40,1440'), 'outline');
    expect(readJoinerySpec(JSON.parse(JSON.stringify(chosen)))?.view).toEqual({ detail: 'outline', hidden: ['front:40,60,40,1440'] });
    expect(readJoinerySpec({ ...spec, view: { detail: 'all-of-it', hidden: ['x', 3, 'plan:1,2,3,4'] } })?.view).toEqual({ hidden: ['plan:1,2,3,4'] });
    expect(readJoinerySpec({ ...spec, view: 'outline' })?.view).toBeUndefined();
  });
});
