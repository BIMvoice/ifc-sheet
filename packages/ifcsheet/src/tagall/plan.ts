/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TAGALL's planner: the labels a plan still needs, from what the model says.
 * A door or window shows its mark (`elementMark`: its Tag, else the mark the
 * schedule gives its type), else a running number the tool gives it (and counts); a room shows its name and its area in the middle
 * of the room, the area read from the model's quantities, else from the
 * footprint. Labels are ordinary parametric labels (`labels/label-all.ts`), so
 * they keep following the model. Doors and windows are placed first, beside
 * their element and clear of everything (`labels/label-layout.ts`), then rooms
 * in the free middle of each footprint (`room-point.ts`). Pure given the
 * element reader; a second run adds only what is missing.
 */

import type { AnnotationType } from '../annotation-type.js';
import { pieceRects, symbolPieces } from '../dimall/avoid.js';
import type { DraftReader, RectsOf } from '../dimall/measure.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import { clipLoop } from '../clip-loop.js';
import { textBoxOf } from '../text-leader.js';
import { labelDraft, labelSize, type ElementReader, type LabelEnv, type LabelPlacement } from '../labels/label-draft.js';
import type { LabelExtras } from '../labels/label-extras.js';
import { growRect, rectAround, rectHitsRing, ringBounds, type Rect } from '../labels/label-geometry.js';
import { labelSpacing, layoutElementOf, layoutLabels, solidPieces, type LayoutElement } from '../labels/label-layout.js';
import type { LabelTarget } from '../labels/label-place.js';
import { readFieldValue } from '../labels/label-resolve.js';
import { RectIndex } from '../labels/rect-index.js';
import { parseFieldRef } from '../labels/label-template.js';
import type { ViewElement } from '../labels/view-elements.js';

import { ringArea, type RoomOfPlan } from './footprint.js';
import { fitRoomTags, type PlacedRoomTag } from './room-fit.js';
import { roomLabelPoint } from './room-point.js';
import { roomLabelPointLeast } from './room-point-least.js';
import { roomLabelOutside } from './room-outside.js';
import { roomLabelSpill } from './room-spill.js';
import { ALL_TAG_PARTS, AREA_FIELDS, MARK_TYPE_ID, ROOM_TYPE_ID, type TagAllSummary, type TagParts } from './types.js';

/** A moved room tag keeps at least half its text height clear of the text it avoids, so the two do not read as one block of text (the label clearance, 0.75 mm, is under a third of a 2.5 mm line). */
const SPILL_GAP = 0.5;

export interface TagAllDrafts {
  /** Every element the view draws, and the doors and windows among them. */
  elements: readonly ViewElement[];
  targets: readonly LabelTarget[];
  /** Each room of the plan: its footprint and the GlobalId of its space. */
  rooms: readonly RoomOfPlan[];
  existing: readonly DraftEntity[];
  placement: LabelPlacement;
  types: { mark: AnnotationType; room: AnnotationType };
  /** How the labels read their elements, measure text, take their styles and ids (`labels/label-draft.ts`). */
  env: LabelEnv;
  /** Reads the drawn annotations (fonts, section links): the symbols a label keeps clear of. */
  reader: DraftReader;
  /** The boxes of the annotations already drawn. */
  rectsOf: RectsOf;
  /**
   * What the plan draws over its cut that a room's label keeps clear of: door leaves and swings, window frames, roof lines
   * and grid, as boxes (the source CEILTAG and the cross-reference marks use: `planSymbolObstacles`). The rooms' labels
   * keep off them as they keep off the marks placed before.
   */
  obstacles?: readonly Rect[];
  /** Which kinds to label (#497); absent: doors, windows and rooms. */
  parts?: TagParts;
  /** A detail's area, drawing metres: only what is seen in it is labelled, and every label stands inside it. */
  crop?: { min: Pt; max: Pt };
}

const MARK_REF = { kind: 'attribute', name: 'Mark' } as const;
const hasValue = (v: unknown): boolean => v !== undefined && v !== null && v !== '';
const within = (r: { min: Pt; max: Pt } | undefined, p: Pt) => !r || (p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y);
const isOpening = (className: string) => /^ifc(door|window)/i.test(className);
const labelledBy = (drafts: readonly DraftEntity[], typeId: string) => new Set(drafts.filter((d) => d.params.atype === typeId && typeof d.params.labelOf === 'string').map((d) => String(d.params.labelOf)));

/** The area the model states for a space, square metres; undefined when it states none. */
export function modelArea(read: ElementReader, guid: string): number | undefined {
  const el = read(guid);
  if (!el) return undefined;
  for (const path of AREA_FIELDS) {
    const ref = parseFieldRef(path);
    const v = ref ? readFieldValue(ref, el).value : undefined;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function tagAllDrafts(input: TagAllDrafts): { drafts: DraftEntity[]; summary: TagAllSummary } {
  const { placement: at, env } = input;
  const read = env.read;
  const parts = input.parts ?? ALL_TAG_PARTS;
  // On a detail a room is labelled where it shows: inside the crop (its area stays the whole room's).
  const rooms = (parts.rooms ? input.rooms : []).flatMap((room) => {
    const shown = input.crop ? clipLoop(room.ring, input.crop) : room.ring;
    return shown.length >= 3 ? [{ room, shown }] : [];
  });
  const summary: TagAllSummary = { marks: 0, numbered: 0, rooms: 0, areaFromModel: 0, areaFromFootprint: 0, roomsTooSmall: 0, already: 0, noRooms: parts.rooms && rooms.length === 0, roomsOverLines: 0, roomsOutside: 0 };
  const drafts: DraftEntity[] = [];
  // The room tags keep their type's clear space from what they avoid (#842); absent, the standard one.
  const clear = labelSpacing(input.types.room.label?.gap).clear * at.paperUnit;

  // Doors and windows.
  const marked = labelledBy(input.existing, MARK_TYPE_ID);
  const openings = input.targets.filter((t) => isOpening(t.className) && (/^ifcdoor/i.test(t.className) ? parts.doors : parts.windows));
  const firstSeen = new Set<string>();
  const todo = openings.filter((t) => !marked.has(t.guid) && !firstSeen.has(t.guid) && !!firstSeen.add(t.guid));
  summary.already += openings.length - todo.length;
  let counter = Math.max(0, ...input.existing.map((d) => (typeof d.params.numbered === 'number' ? d.params.numbered : 0)));
  const extrasOf = new Map<string, LabelExtras>();
  for (const t of todo) {
    const el = read(t.guid);
    if (!el) continue;
    // Numbered only when the mark reads nothing (the office's sources for it included): never the Name, never a class word.
    if (!hasValue(readFieldValue(MARK_REF, el).value)) extrasOf.set(t.guid, { numbered: ++counter });
  }
  // The marks stand their type's gap from their door or window (#842), and keep it from each other and what they avoid.
  const markGap = input.types.mark.label?.gap;
  const gap = labelSpacing(markGap).gap * at.paperUnit;
  const items = todo.flatMap((t) => {
    const size = labelSize(env, input.types.mark, t.guid, at.textHeight, at.locale, extrasOf.get(t.guid));
    return size ? [{ id: String(t.renderId), ring: t.ring, ...size, ...(/^ifcdoor/i.test(t.className) ? { preferred: beyondSwing(t.ring, size.w, size.h, gap) } : { fallback: beyondSwing(t.ring, size.w, size.h, gap).slice(2) }) }] : [];
  });
  // What a label keeps clear of besides the elements' outlines: the room a door swings through, and the section symbols on the plan.
  const swings = input.targets.filter((t) => /^ifcdoor/i.test(t.className)).map((t): LayoutElement => ({ id: String(t.renderId), ring: swingOf(t.ring) }));
  const sections = pieceRects(symbolPieces(input.existing, input.reader), 0.2 * at.textHeight);
  // Everything a label keeps clear of sits on a grid (`labels/rect-index.ts`): a place is tested against the boxes near it, not against every box of the plan.
  const placed = input.rectsOf(input.existing);
  const base = [...placed, ...sections];
  const index = new RectIndex(4 * at.textHeight);
  for (const r of base) index.add(r);
  const scene = { elements: [...input.elements.map(layoutElementOf), ...swings], annotations: index, paperUnit: at.paperUnit, ...(markGap === undefined ? {} : { gapMm: markGap }) };
  const spots = layoutLabels(items, scene);
  // What the rooms keep clear of: the same boxes and the marks drawn (a mark that was placed but not drawn, outside a detail's crop, is not one).
  const roomIndex = new RectIndex(4 * at.textHeight);
  // A room tag keeps half its text height clear of what is already on the view, wherever it goes, as one that does not fit does
  // (`SPILL_GAP`, #796); the label clearance alone let FZK's Galerie tag sit 1.1 mm beside a note put where it goes.
  // The same boxes as a list, the room tags' own left out: what a tag made to fit keeps clear of (`room-fit.ts`).
  const roomObstacles: Rect[] = [...placed.map((r) => growRect(r, Math.max(0, SPILL_GAP * at.textHeight - clear))), ...sections, ...(input.obstacles ?? [])];
  for (const r of roomObstacles) roomIndex.add(r);
  // What a room tag that does not fit moves clear of: real texts only (the notes, tags and labels drawn, never a door swing or a frame), and not over a cut wall.
  const textIndex = new RectIndex(4 * at.textHeight);
  for (const r of base) textIndex.add(r);
  const walls = new RectIndex<readonly Pt[]>(4 * at.textHeight);
  for (const t of input.targets) if (/^ifc(wall|curtainwall|column)/i.test(t.className)) walls.add(ringBounds(t.ring), t.ring);
  for (const t of todo) {
    const spot = spots.get(String(t.renderId));
    const extras = extrasOf.get(t.guid) ?? {};
    const draft = spot ? labelDraft(env, input.types.mark, t.guid, spot.centre, at, t.ring, extras) : null;
    if (!draft || !spot || !within(input.crop, spot.centre)) continue;
    drafts.push(draft);
    roomIndex.add(rectAround(spot.centre, ...sizeOf(items, t)));
    roomObstacles.push(rectAround(spot.centre, ...sizeOf(items, t)));
    textIndex.add(rectAround(spot.centre, ...sizeOf(items, t)));
    summary.marks++;
    if (extras.numbered !== undefined) summary.numbered++;
  }

  // Rooms.
  const roomed = labelledBy(input.existing, ROOM_TYPE_ID);
  const rings = [...input.elements.map((e) => e.ring), ...swings.map((s) => s.ring)];
  const ringIndex = new RectIndex<readonly Pt[]>(4 * at.textHeight);
  for (const ring of rings) ringIndex.add(ringBounds(ring), ring);
  // What a room tag keeps its text off (#897's rule for the marks): every piece the plan cuts, not only each element's biggest
  // (`solidPieces`); the door swings and what is seen beyond the cut too when it looks for a place.
  const pieces = solidPieces(input.elements.filter((e) => e.cut).map(layoutElementOf));
  const ringsOn = (list: readonly { b: Rect; ring: readonly Pt[] }[]) => {
    const index = new RectIndex<readonly Pt[]>(4 * at.textHeight);
    for (const r of list) index.add(r.b, r.ring);
    return index;
  };
  const swingRings = swings.map((s) => ({ b: ringBounds(s.ring), ring: s.ring }));
  // Whether a tag lies over the cut is read from the cut as drawn (`cutOutlines`), not from the hulls the search keeps clear of.
  const cut = ringsOn(input.elements.flatMap((e) => (e.cut ? (e.cutOutlines ?? e.pieces ?? [e.ring]) : [])).map((ring) => ({ b: ringBounds(ring), ring })));
  // Where an off-the-cut tag may go: clear of everything drawn, else clear of the cut and the swings only.
  const offCut = [ringsOn([...solidPieces(input.elements.map(layoutElementOf)), ...swingRings]), ringsOn([...pieces, ...swingRings])];
  const overCut = (c: Pt, w: number, h: number): boolean => boxOverCut(rectAround(c, w, h));
  const boxOverCut = (tag: Rect): boolean => {
    let over = false;
    cut.query(tag, (_, ring) => (over = rectHitsRing(tag, ring)));
    return over;
  };
  // The box the tag's text is drawn in, which is what lies over the cut or not.
  const drawnOverCut = (d: DraftEntity): boolean => {
    if (d.shape.type !== 'text') return false;
    const pts = textBoxOf(d.shape.p, d.shape.text, d.shape.height, d.shape.rotation, d.shape.frame, env.up, env.widthOf);
    return boxOverCut({ x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) });
  };
  const roomTags: PlacedRoomTag[] = [];
  const seen = new Set<string>();
  for (const { room, shown } of rooms) {
    if (seen.has(room.guid)) continue;
    seen.add(room.guid);
    if (roomed.has(room.guid)) { summary.already++; continue; }
    const fromModel = modelArea(read, room.guid) !== undefined;
    // A plan's footprint is the floor; a section's outline (`floorArea` present) is a slice, so its area is the space's own floor area or none.
    const computed = room.floorArea === undefined ? ringArea(room.ring) : room.floorArea;
    const extras: LabelExtras = fromModel || computed === null ? {} : { computedArea: computed };
    const size = labelSize(env, input.types.room, room.guid, at.textHeight, at.locale, extras);
    if (!size) continue;
    // On a section the lines the drawing shows in the room are kept clear of when there is room to; when there is not, the label goes over the fewest of them (`room-point-least.ts`) and the run says so.
    const hard = { rects: [], rings: [], rectIndex: roomIndex, ringIndex };
    const wanted = room.preferClear?.length ? roomLabelPoint(shown, size.w, size.h, { ...hard, rects: room.preferClear }, clear) : null;
    let spot = wanted?.fits ? wanted : roomLabelPoint(shown, size.w, size.h, hard, clear);
    let tip: Pt | undefined;
    if (wanted && !wanted.fits) {
      // No place inside the room clear of the lines: outside it, with a short leader into the room; failing that, over the fewest lines, and the run says so.
      const outside = room.outside ? roomLabelOutside(shown, size.w, size.h, room.outside, roomIndex, clear) : null;
      if (outside) {
        spot = { centre: outside.centre, fits: true };
        tip = outside.tip;
        summary.roomsOutside++;
      } else {
        const least = roomLabelPointLeast(shown, size.w, size.h, room.preferClear ?? [], roomIndex);
        if (least) spot = { centre: least.centre, fits: true };
        summary.roomsOverLines++;
      }
    }
    // Too big for its room, with no place inside: it still keeps off the texts already drawn, beside its deepest point with a leader to it; none free keeps the deepest point.
    if (!spot.fits && !tip) {
      const spill = roomLabelSpill(shown, size.w, size.h, spot.centre, textIndex, Math.max(clear, SPILL_GAP * at.textHeight), { crop: input.crop, walls });
      if (spill) { spot = { centre: spill.centre, fits: false }; tip = spill.tip; }
    }
    // Over a cut piece (measured on FZK's ground floor: the living room's tag on a flight of the stair, the floor slab below
    // having left it no place "clear" in the room): the deepest place inside the room off every piece and clear of the rest,
    // with no leader. With none, it keeps its place. A tag off the cut is never moved.
    if (overCut(spot.centre, size.w, size.h)) {
      for (const ringIndex of offCut) {
        const off = roomLabelPoint(shown, size.w, size.h, { rects: [], rings: [], rectIndex: roomIndex, ringIndex }, clear);
        if (off.fits) { spot = off; tip = undefined; break; }
      }
    }
    const placed = labelDraft(env, input.types.room, room.guid, spot.centre, at, undefined, extras);
    // The leader stays as it is drawn: the tag is not on the room, so `settleLeader` must not take it for a label with none (`leaderFixed`).
    const draft = placed && tip && placed.shape.type === 'text' ? { ...placed, shape: { ...placed.shape, leader: tip }, params: { ...placed.params, leaderFixed: true } } : placed;
    if (!draft) continue;
    roomTags.push({ guid: room.guid, shown, extras, centre: spot.centre, ...size, draft, over: drawnOverCut(draft), fits: spot.fits });
    roomIndex.add(growRect(rectAround(spot.centre, size.w, size.h), 0));
    textIndex.add(rectAround(spot.centre, size.w, size.h));
    summary.rooms++;
    if (fromModel) summary.areaFromModel++; else summary.areaFromFootprint++;
  }
  // A tag still over the cut, its room too small for it: compact inside, else beside the room with a leader, else as it is (`room-fit.ts`).
  const fitted = fitRoomTags(roomTags, { env, type: input.types.room, at, clear, obstacles: roomObstacles, solid: offCut, crop: input.crop });
  if (fitted.compact) summary.roomsCompact = fitted.compact;
  if (fitted.leader) summary.roomsLeader = fitted.leader;
  for (const t of roomTags) {
    drafts.push(t.draft);
    if (!t.fits) summary.roomsTooSmall++;
  }
  return { drafts, summary };
}

/**
 * Where a door's tag goes, in order: on the door's axis beyond the leaf's reach, on either side; then at growing
 * distances all round it. The first free one is taken; the tag then carries a leader to the door.
 */
function beyondSwing(ring: readonly Pt[], w: number, h: number, gap: number): Pt[] {
  const b = ringBounds(ring);
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0, c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  const along = bw >= bh;
  const reach = Math.max(bw, bh) + Math.min(bw, bh) / 2 + gap + (along ? h : w) / 2;
  const axis = [1, -1].map((s) => (along ? { x: c.x, y: c.y + s * reach } : { x: c.x + s * reach, y: c.y }));
  const round = [1, 1.5, 2, 2.5].flatMap((k) => Array.from({ length: 8 }, (_, i): Pt => {
    const a = (i * Math.PI) / 4;
    return { x: c.x + Math.cos(a) * k * (reach + w / 2), y: c.y + Math.sin(a) * k * (reach + h / 2) };
  }));
  return [...axis, ...round];
}

/** The ground a door leaf may sweep: its outline grown by its own length, to both sides of it. */
function swingOf(ring: readonly Pt[]): Pt[] {
  const b = ringBounds(ring);
  const w = b.x1 - b.x0, h = b.y1 - b.y0, reach = Math.max(w, h);
  const [gx, gy] = w >= h ? [0, reach] : [reach, 0];
  return [{ x: b.x0 - gx, y: b.y0 - gy }, { x: b.x1 + gx, y: b.y0 - gy }, { x: b.x1 + gx, y: b.y1 + gy }, { x: b.x0 - gx, y: b.y1 + gy }];
}

const sizeOf = (items: readonly { id: string; w: number; h: number }[], t: LabelTarget): [number, number] => {
  const i = items.find((x) => x.id === String(t.renderId));
  return [i?.w ?? 0, i?.h ?? 0];
};

