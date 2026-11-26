/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What TAGALL does with a room tag left in trouble after every room of the view has its tag: over the cut (a shaft, a WC
 * too small for it), over another text (a room tag or a door or window mark), or with a leader too long or running over
 * the cut or another text. In this order, the first that is clear is taken:
 *   (1) inside the room with no leader: the whole tag, else compact (the room tag type's template without the name, else
 *       its number alone: `labels/label-compact.ts`);
 *   (2) just outside the room with a short leader to its deepest point (`room-beside.ts`): the whole tag, else compact;
 *       in a run of rooms too small for their tags (a row of WCs) compact first. The leader is at most `leaderMax` long and
 *       crosses no cut piece but the wall it enters the room through, and no text;
 *   (3) the number alone at the room's best place, when that leaves the tag in less trouble than it was (in a run of tiny
 *       rooms, in no more);
 *   (4) as it was.
 * The tags are gone through twice, so one left in trouble by its neighbours can take the place they have since freed.
 * A tag in no trouble is never moved, and every tag moved keeps off all the others. Pure.
 */

import type { AnnotationType } from '../annotation-type.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import { COMPACT_MODES, type CompactMode } from '../labels/label-compact.js';
import { labelDraft, labelSize, labelText, type LabelEnv, type LabelPlacement } from '../labels/label-draft.js';
import type { LabelExtras } from '../labels/label-extras.js';
import { growRect, nearestOnRing, rectAround, rectsOverlap, ringBounds, type Rect } from '../labels/label-geometry.js';
import { RectIndex } from '../labels/rect-index.js';
import { leaderStart } from '../text-leader.js';
import { roomLabelBeside } from './room-beside.js';
import { crossing, ENTRY_BAND, segmentHitsRect } from './room-outside.js';
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
  /** Where its leader ends, when it has one. */
  tip?: Pt;
}

export interface RoomFitScene {
  env: LabelEnv;
  type: AnnotationType;
  at: LabelPlacement;
  /** The clear space a room tag keeps, drawing units. */
  clear: number;
  /** The boxes a room tag keeps clear of besides the other room tags: the annotations, symbols and marks. */
  obstacles: readonly Rect[];
  /** The texts among them: the annotations drawn and the door and window marks. A tag over one of these is in trouble. */
  texts: readonly Rect[];
  /** Where a tag may go, in order: clear of everything drawn, else clear of the cut and the door swings, else of the cut only. */
  solid: readonly RectIndex<readonly Pt[]>[];
  /** The cut as drawn: a leader crosses none of it but the wall it enters its room through. */
  cut: RectIndex<readonly Pt[]>;
  /** Whether a placed tag's text, as drawn, lies over the cut. */
  overCut: (draft: DraftEntity) => boolean;
  /** The longest leader, drawing units. */
  leaderMax: number;
  crop?: { min: Pt; max: Pt };
}

export interface RoomFitCount {
  compact: number;
  leader: number;
}

/** A tag's longest leader on paper, millimetres: past it a leader reads as pointing at another room. */
export const ROOM_LEADER_MAX_MM = 12;

const boxOf = (t: { centre: Pt; w: number; h: number }): Rect => rectAround(t.centre, t.w, t.h);

/** Whether the leader a-b crosses a cut piece anywhere but at the outline of the room it enters. */
function leaderCrossesCut(cut: RectIndex<readonly Pt[]>, room: readonly Pt[], a: Pt, b: Pt): boolean {
  const span: Rect = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  let bad = false;
  cut.query(span, (_, ring) => {
    for (let i = 0; i < ring.length && !bad; i++) {
      const at = crossing(a, b, ring[i]!, ring[(i + 1) % ring.length]!);
      if (!at) continue;
      const near = nearestOnRing(room, at);
      bad = Math.hypot(near.x - at.x, near.y - at.y) > ENTRY_BAND;
    }
    return bad;
  });
  return bad;
}

/** `tags` with each one in trouble moved where it is clear, as the header says; the same entries otherwise. */
export function fitRoomTags(tags: PlacedRoomTag[], scene: RoomFitScene): RoomFitCount {
  const { env, type, at, clear } = scene;
  const moved = new Set<number>();
  const tiny = tags.map((t) => {
    const b = ringBounds(t.shown);
    return t.w > b.x1 - b.x0 - 2 * clear || t.h > b.y1 - b.y0 - 2 * clear;
  });
  // A run of tiny rooms: another tiny room within a tag's size of this one (a row of WCs, a WC and its shaft).
  const inRun = tags.map((t, i) => tiny[i] && tags.some((o, j) => j !== i && tiny[j] && rectsOverlap(growRect(ringBounds(t.shown), Math.max(t.w, t.h)), ringBounds(o.shown))));
  const others = (i: number) => tags.flatMap((o, j) => (j === i ? [] : [boxOf(o)]));
  const leaderBad = (i: number, box: Rect, tip: Pt | undefined, texts: readonly Rect[]): boolean => {
    const from = tip ? leaderStart(box, false, tip) : undefined;
    if (!tip || !from) return false;
    if (Math.hypot(tip.x - from.x, tip.y - from.y) > scene.leaderMax) return true;
    if (leaderCrossesCut(scene.cut, tags[i]!.shown, from, tip)) return true;
    return texts.some((r) => segmentHitsRect(r, from, tip));
  };
  /** How much trouble a tag is in, 0 to 3: over the cut, over a text, a bad leader. */
  const trouble = (i: number, t: PlacedRoomTag): number => {
    const texts = [...scene.texts, ...others(i)];
    const box = boxOf(t);
    return (scene.overCut(t.draft) ? 1 : 0) + (texts.some((r) => rectsOverlap(box, r)) ? 1 : 0) + (leaderBad(i, box, t.tip, texts) ? 1 : 0);
  };
  const sizeOf = (tag: PlacedRoomTag, compact: CompactMode | undefined) => {
    const extras: LabelExtras = { ...tag.extras };
    if (compact) extras.compact = compact; else delete extras.compact;
    const size = labelSize(env, type, tag.guid, at.textHeight, at.locale, extras);
    return size ? { extras, ...size } : null;
  };
  const place = (i: number, tag: PlacedRoomTag, s: { extras: LabelExtras; w: number; h: number }, centre: Pt, tip?: Pt): boolean => {
    const placed = labelDraft(env, type, tag.guid, centre, at, undefined, s.extras);
    if (!placed) return false;
    // A leader stays as it is drawn (`leaderFixed`), as a tag spilt out of its room does.
    const draft: DraftEntity = tip && placed.shape.type === 'text' ? { ...placed, id: tag.draft.id, shape: { ...placed.shape, leader: tip }, params: { ...placed.params, leaderFixed: true } } : { ...placed, id: tag.draft.id };
    tags[i] = { ...tag, extras: s.extras, centre, w: s.w, h: s.h, draft, over: scene.overCut(draft), fits: true, ...(tip ? { tip } : {}) };
    if (!tip) delete tags[i]!.tip;
    moved.add(i);
    return true;
  };

  // Twice: a tag left in trouble by its neighbours the first time round (a row of WCs) may find its place once they have moved.
  for (let round = 0; round < 2; round++) tags.forEach((tag, i) => {
    const before = trouble(i, tag);
    if (before === 0) return;
    const taken = new RectIndex(4 * at.textHeight);
    for (const r of scene.obstacles) taken.add(r);
    const texts = new RectIndex(4 * at.textHeight);
    for (const r of [...scene.texts, ...others(i)]) { taken.add(r); texts.add(r); }
    // Compact only with a number to show, so the room is still named on the plan.
    const compactOk = !!labelText(env, type, tag.guid, at.locale, { ...tag.extras, compact: 'number' });
    const modes: (CompactMode | undefined)[] = [undefined, ...(compactOk ? COMPACT_MODES : [])];
    // (1) Inside, no leader: clear of everything, else of the texts only (never of the cut or a door swing).
    for (const mode of modes) {
      const s = sizeOf(tag, mode);
      if (!s) continue;
      for (const avoid of [taken, texts]) {
        const spot = scene.solid.map((ringIndex) => roomLabelPoint(tag.shown, s.w, s.h, { rects: [], rings: [], rectIndex: avoid, ringIndex }, clear)).find((p) => p.fits);
        if (spot && place(i, tag, s, spot.centre)) return;
      }
    }
    // (2) Beside the room, a short leader to its deepest point that crosses neither the cut nor a text; clear of everything, else of the texts only.
    const tip = roomLabelPoint(tag.shown, 1e-3, 1e-3, { rects: [], rings: [] }, 0).centre;
    const textList = [...scene.texts, ...others(i)];
    const besideModes = inRun[i] ? [...modes.slice(1), undefined] : modes;
    for (const mode of besideModes) {
      const s = sizeOf(tag, mode);
      if (!s) continue;
      const leaderOk = (c: Pt) => !leaderBad(i, rectAround(c, s.w, s.h), tip, textList);
      for (const annotations of [taken, texts]) {
        for (const solid of scene.solid) {
          const centre = roomLabelBeside(tag.shown, s.w, s.h, clear, { solid, annotations, crop: scene.crop, accept: leaderOk });
          if (centre && place(i, tag, s, centre, tip)) return;
        }
      }
    }
    // (3) The number alone at the room's best place, when that is less trouble.
    const s = compactOk ? sizeOf(tag, 'number') : null;
    if (!s) return;
    const spot = roomLabelPoint(tag.shown, s.w, s.h, { rects: [], rings: [], rectIndex: texts, ringIndex: scene.solid[scene.solid.length - 1] }, clear);
    const draft = labelDraft(env, type, tag.guid, spot.centre, at, undefined, s.extras);
    if (!draft) return;
    const trial: PlacedRoomTag = { ...tag, extras: s.extras, centre: spot.centre, w: s.w, h: s.h, draft };
    delete trial.tip;
    // In a run of tiny rooms the smaller tag is taken even at the same trouble: it leaves its neighbours more room.
    const after = trouble(i, trial);
    if (after < before || (inRun[i] && after === before && s.w * s.h < tag.w * tag.h)) place(i, tag, s, spot.centre);
    // (4) As it was.
  });
  const count: RoomFitCount = { compact: 0, leader: 0 };
  for (const i of moved) {
    if (tags[i]!.extras.compact) count.compact++;
    if (tags[i]!.tip) count.leader++;
  }
  return count;
}
