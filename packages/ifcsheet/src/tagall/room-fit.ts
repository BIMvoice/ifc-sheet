/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What TAGALL does with a room tag that is left over the cut because the room is too small for it, as drawings do for a
 * shaft, a WC or a store, in this order: (1) a compact tag (the room tag type's template without the name, else its number
 * alone: `labels/label-compact.ts`) inside the room, clear of the cut; (2) the whole tag just outside the room at the nearest
 * clear place, with a short leader to the room's deepest point (`room-beside.ts`); (3) the tag as it was. Run after every room
 * of the view has its tag, so a tag that was clear is never moved and the ones moved keep off all the others. Pure.
 */

import type { AnnotationType } from '../annotation-type.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import { COMPACT_MODES } from '../labels/label-compact.js';
import { labelDraft, labelSize, labelText, type LabelEnv, type LabelPlacement } from '../labels/label-draft.js';
import type { LabelExtras } from '../labels/label-extras.js';
import { rectAround, type Rect } from '../labels/label-geometry.js';
import { RectIndex } from '../labels/rect-index.js';
import { roomLabelBeside } from './room-beside.js';
import { roomLabelPoint } from './room-point.js';

/** A room tag placed in the first pass. */
export interface PlacedRoomTag {
  guid: string;
  /** The room as the view shows it. */
  shown: readonly Pt[];
  extras: LabelExtras;
  centre: Pt;
  w: number;
  h: number;
  draft: DraftEntity;
  /** It lies over a piece the view cuts. */
  over: boolean;
  /** It fits inside its room (else the run counts it too small). */
  fits: boolean;
}

export interface RoomFitScene {
  env: LabelEnv;
  type: AnnotationType;
  at: LabelPlacement;
  /** The clear space a room tag keeps, drawing units. */
  clear: number;
  /** The boxes a room tag keeps clear of besides the other room tags: the annotations, symbols and marks. */
  obstacles: readonly Rect[];
  /** Where a tag may go, in order: clear of everything drawn, else clear of the cut and the door swings only. */
  solid: readonly RectIndex<readonly Pt[]>[];
  crop?: { min: Pt; max: Pt };
}

export interface RoomFitCount {
  compact: number;
  leader: number;
}

/** `tags` with each one over the cut made compact or put beside its room where that is clear; the same entries otherwise. */
export function fitRoomTags(tags: PlacedRoomTag[], scene: RoomFitScene): RoomFitCount {
  const { env, type, at, clear } = scene;
  const count: RoomFitCount = { compact: 0, leader: 0 };
  tags.forEach((tag, i) => {
    if (!tag.over) return;
    const taken = new RectIndex(4 * at.textHeight);
    for (const r of scene.obstacles) taken.add(r);
    tags.forEach((o, j) => { if (j !== i) taken.add(rectAround(o.centre, o.w, o.h)); });
    // (1) Compact, inside: only with a number to show, so the room is still named on the plan.
    if (labelText(env, type, tag.guid, at.locale, { ...tag.extras, compact: 'number' })) {
      for (const compact of COMPACT_MODES) {
        const extras = { ...tag.extras, compact };
        const size = labelSize(env, type, tag.guid, at.textHeight, at.locale, extras);
        if (!size || (size.w >= tag.w && size.h >= tag.h)) continue;
        const spot = scene.solid.map((ringIndex) => roomLabelPoint(tag.shown, size.w, size.h, { rects: [], rings: [], rectIndex: taken, ringIndex }, clear)).find((p) => p.fits);
        const draft = spot ? labelDraft(env, type, tag.guid, spot.centre, at, undefined, extras) : null;
        if (spot && draft) {
          tags[i] = { ...tag, extras, centre: spot.centre, ...size, draft: { ...draft, id: tag.draft.id }, over: false, fits: true };
          count.compact++;
          return;
        }
      }
    }
    // (2) The whole tag beside the room, its leader to the room's deepest point.
    for (const solid of scene.solid) {
      const centre = roomLabelBeside(tag.shown, tag.w, tag.h, clear, { solid, annotations: taken, crop: scene.crop });
      const placed = centre ? labelDraft(env, type, tag.guid, centre, at, undefined, tag.extras) : null;
      if (!centre || !placed || placed.shape.type !== 'text') continue;
      const tip = roomLabelPoint(tag.shown, 1e-3, 1e-3, { rects: [], rings: [] }, 0).centre;
      // The leader stays as it is drawn (`leaderFixed`), as a tag spilt out of its room does.
      const draft: DraftEntity = { ...placed, id: tag.draft.id, shape: { ...placed.shape, leader: tip }, params: { ...placed.params, leaderFixed: true } };
      tags[i] = { ...tag, centre, draft, over: false, fits: true };
      count.leader++;
      return;
    }
    // (3) As it was.
  });
  return count;
}
