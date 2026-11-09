/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room tag too big for its room keeps off the texts already on the view, as a door or window tag does (found while fixing #557, PR #779:
 * the tag "7 Galerie" of FZK's Dachgeschoss plan lay on a note put on the room, `tagAllTooSmall` 1).
 */

import { describe, expect, it } from 'vitest';
import { annotationRects } from '../dimall/annotation-rects.js';
import { textBoxOf } from '../text-leader.js';
import { tableMeasure } from '../dimall/measure.js';
import type { DraftEntity } from '../draft-types.js';
import type { LabelElement } from '../labels/label-resolve.js';
import { tagAllDrafts } from './plan.js';
import { ROOM_TYPE_ID, TAGALL_TYPES } from './types.js';

// The plan's frame: y up, as the label env says (`up: 1`), so that the boxes are measured as the labels are centred.
const measure = { ...tableMeasure, frame: { up: 1 as const, right: 1 as const } };
const rectsOf = annotationRects(measure);

const room: LabelElement = {
  attribute: (name) => (name === 'Name' ? 'Galerie' : ''), className: () => 'IfcSpace', typeName: () => '', propertySets: () => [], quantitySets: () => [],
  typePropertySets: () => [], typeQuantitySets: () => [], materials: () => [], storey: () => '', lengthUnitScale: () => 1,
};

/** A 1.2 m by 0.6 m room (a gallery) with a text of the draughtsman's in its middle; the tag of a room needs more than that. */
function run(existing: readonly DraftEntity[], more: Partial<Parameters<typeof tagAllDrafts>[0]> = {}) {
  let n = 0;
  const ring = [{ x: 0, y: 0 }, { x: 1.2, y: 0 }, { x: 1.2, y: 0.6 }, { x: 0, y: 0.6 }];
  const [mark, roomType] = TAGALL_TYPES;
  return tagAllDrafts({
    elements: [], targets: [], rooms: [{ ring, at: 'cut', renderId: 1, guid: 'g' }], existing,
    placement: { viewId: 'v', layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', paperUnit: 0.01, locale: 'en' },
    types: { mark: mark!, room: roomType! }, env: { read: () => room, up: 1, styled: () => ({}), newId: () => `t${++n}` },
    reader: { sectionLink: () => null, measure }, rectsOf, parts: { doors: false, windows: false, rooms: true }, ...more,
  });
}

/** The box of the text itself, the leader left out. */
const boxOf = (d: DraftEntity) => {
  if (d.shape.type !== 'text') throw new Error('not a text');
  const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, 1);
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
};
const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
  Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) + 1e-6 && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0) + 1e-6;

describe('a room tag too big for its room (#557, PR #779)', () => {
  const note: DraftEntity = { id: 'note', viewId: 'v', layerId: 'l', shape: { type: 'text', p: { x: 0.4, y: 0.3 }, text: 'NOTE', height: 0.25, rotation: 0 }, params: {} };
  const tagOf = (drafts: readonly DraftEntity[]) => drafts.find((d) => d.params.atype === ROOM_TYPE_ID)!;
  const leaderOf = (d: DraftEntity) => d.shape.type === 'text' ? d.shape.leader : undefined;

  it('is reported too small, and lies where it did when nothing else is on the view', () => {
    const { drafts, summary } = run([]);
    expect(summary.roomsTooSmall).toBe(1);
    expect(leaderOf(tagOf(drafts))).toBeUndefined();
  });

  it('keeps clear of a text lying where it would go, and still touches its room', () => {
    const { drafts, summary } = run([note]);
    expect(summary.rooms).toBe(1);
    const tag = tagOf(drafts);
    expect(overlap(boxOf(tag), boxOf(note))).toBe(false);
    expect(overlap(boxOf(tag), { x0: 0, y0: 0, x1: 1.2, y1: 0.6 }) || !!leaderOf(tag), 'the tag touches the room or has a leader into it').toBe(true);
    expect(summary.roomsTooSmall).toBe(1);
  });

  // Review of the PR: it ignored the detail crop, and it could put a moved tag over a cut wall.
  it('keeps the tag inside the detail crop: with no clear place there it stays at the deepest point', () => {
    const crop = { min: { x: 0, y: 0 }, max: { x: 1.2, y: 0.6 } };
    const { drafts } = run([note], { crop });
    const tag = tagOf(drafts);
    // Every clear place for a tag this size lies partly outside the crop, so none is taken: the tag stands where it does with nothing else on the view.
    expect(leaderOf(tag)).toBeUndefined();
    expect(boxOf(tag)).toEqual(boxOf(tagOf(run([], { crop }).drafts)));
  });

  it('does not put a moved tag over a cut wall', () => {
    const wallRing = [{ x: -3, y: -0.4 }, { x: 4, y: -0.4 }, { x: 4, y: 0 }, { x: -3, y: 0 }];
    const targets = [{ guid: 'w', className: 'IfcWall', anchor: { x: 0.5, y: -0.2 }, renderId: 2, ring: wallRing }];
    const { drafts } = run([note], { targets });
    const box = boxOf(tagOf(drafts));
    expect(overlap(box, { x0: -3, y0: -0.4, x1: 4, y1: 0 })).toBe(false);
    expect(overlap(box, boxOf(note))).toBe(false);
  });
});
