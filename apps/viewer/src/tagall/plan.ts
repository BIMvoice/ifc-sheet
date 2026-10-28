/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * TAGALL's planner: the labels a plan still needs, from what the model says.
 * A door or window shows its Tag, else its Name, else a running number the
 * tool gives it (and counts); a room shows its name and its area in the middle
 * of the room, the area read from the model's quantities, else from the
 * footprint. Labels are ordinary parametric labels (`labels/label-all.ts`), so
 * they keep following the model. Doors and windows are placed first, beside
 * their element and clear of everything (`labels/label-layout.ts`), then rooms
 * in the free middle of each footprint (`room-point.ts`). Pure given the
 * element reader; a second run adds only what is missing.
 */

import type { AnnotationType } from '@/catalogue/types';
import type { DraftEntity, Pt } from '@/drafting/types';
import { labelDraft, labelSize, type ElementReader, type LabelPlacement } from '@/labels/label-all';
import { rectsOf } from '@/labels/label-annotations';
import type { LabelExtras } from '@/labels/label-extras';
import { growRect, rectAround, ringBounds, type Rect } from '@/labels/label-geometry';
import { layoutLabels, LABEL_CLEAR_MM, LABEL_GAP_MM, type LayoutElement } from '@/labels/label-layout';
import type { LabelTarget } from '@/labels/label-place';
import { readFieldValue } from '@/labels/label-resolve';
import { parseFieldRef } from '@/labels/label-template';
import type { ViewElement } from '@/labels/view-elements';
import { clipLoop } from '@/project/drawing-crop';
import { pieceRects, symbolPieces } from '@/dimall/avoid';
import { RectIndex } from '@/labels/rect-index';
import { ringArea, type RoomFootprint } from './footprint';
import { roomLabelPoint } from './room-point';
import { AREA_FIELDS, MARK_TYPE_ID, ROOM_TYPE_ID, type TagAllSummary } from './types';

export interface TagAllInput {
  /** Every element the view draws, and the doors and windows among them. */
  elements: readonly ViewElement[];
  targets: readonly LabelTarget[];
  /** Each room of the plan: its footprint and the GlobalId of its space. */
  rooms: readonly (RoomFootprint & { guid: string })[];
  existing: readonly DraftEntity[];
  placement: LabelPlacement;
  types: { mark: AnnotationType; room: AnnotationType };
  read: ElementReader;
  /**
   * What the plan draws over its cut that a room's label keeps clear of: door leaves and swings, window frames, roof lines
   * and grid, as boxes (the source CEILTAG and the cross-reference marks use: `planSymbolObstacles`). The rooms' labels
   * keep off them as they keep off the marks placed before.
   */
  obstacles?: readonly Rect[];
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

export function planTagAll(input: TagAllInput): { drafts: DraftEntity[]; summary: TagAllSummary } {
  const { placement: at, read } = input;
  // On a detail a room is labelled where it shows: inside the crop (its area stays the whole room's).
  const rooms = input.rooms.flatMap((room) => {
    const shown = input.crop ? clipLoop(room.ring, input.crop) : room.ring;
    return shown.length >= 3 ? [{ room, shown }] : [];
  });
  const summary: TagAllSummary = { marks: 0, numbered: 0, rooms: 0, areaFromModel: 0, areaFromFootprint: 0, roomsTooSmall: 0, already: 0, noRooms: rooms.length === 0 };
  const drafts: DraftEntity[] = [];
  const clear = LABEL_CLEAR_MM * at.paperUnit;

  // Doors and windows.
  const marked = labelledBy(input.existing, MARK_TYPE_ID);
  const openings = input.targets.filter((t) => isOpening(t.className));
  const firstSeen = new Set<string>();
  const todo = openings.filter((t) => !marked.has(t.guid) && !firstSeen.has(t.guid) && !!firstSeen.add(t.guid));
  summary.already += openings.length - todo.length;
  let counter = Math.max(0, ...input.existing.map((d) => (typeof d.params.numbered === 'number' ? d.params.numbered : 0)));
  const extrasOf = new Map<string, LabelExtras>();
  for (const t of todo) {
    const el = read(t.guid);
    if (!el) continue;
    // Numbered only when the mark and the name both read nothing (the office's sources for the mark included).
    if (!hasValue(readFieldValue(MARK_REF, el).value) && el.attribute('Name') === '') extrasOf.set(t.guid, { numbered: ++counter });
  }
  const gap = LABEL_GAP_MM * at.paperUnit;
  const items = todo.flatMap((t) => {
    const size = labelSize(input.types.mark, t.guid, at.textHeight, at.locale, extrasOf.get(t.guid), read);
    return size ? [{ id: String(t.renderId), ring: t.ring, ...size, ...(/^ifcdoor/i.test(t.className) ? { preferred: beyondSwing(t.ring, size.w, size.h, gap) } : { fallback: beyondSwing(t.ring, size.w, size.h, gap).slice(2) }) }] : [];
  });
  // What a label keeps clear of besides the elements' outlines: the room a door swings through, and the section symbols on the plan.
  const swings = input.targets.filter((t) => /^ifcdoor/i.test(t.className)).map((t): LayoutElement => ({ id: String(t.renderId), ring: swingOf(t.ring) }));
  const sections = pieceRects(symbolPieces(input.existing), 0.2 * at.textHeight);
  // Everything a label keeps clear of sits on a grid (`labels/rect-index.ts`): a place is tested against the boxes near it, not against every box of the plan.
  const base = [...rectsOf(input.existing), ...sections];
  const index = new RectIndex(4 * at.textHeight);
  for (const r of base) index.add(r);
  const scene = { elements: [...input.elements.map((e): LayoutElement => ({ id: String(e.renderId), ring: e.ring })), ...swings], annotations: index, paperUnit: at.paperUnit };
  const spots = layoutLabels(items, scene);
  // What the rooms keep clear of: the same boxes and the marks drawn (a mark that was placed but not drawn, outside a detail's crop, is not one).
  const roomIndex = new RectIndex(4 * at.textHeight);
  for (const r of base) roomIndex.add(r);
  for (const r of input.obstacles ?? []) roomIndex.add(r);
  for (const t of todo) {
    const spot = spots.get(String(t.renderId));
    const extras = extrasOf.get(t.guid) ?? {};
    const draft = spot ? labelDraft(input.types.mark, t.guid, spot.centre, at, t.ring, extras, read) : null;
    if (!draft || !spot || !within(input.crop, spot.centre)) continue;
    drafts.push(draft);
    roomIndex.add(rectAround(spot.centre, ...sizeOf(items, t)));
    summary.marks++;
    if (extras.numbered !== undefined) summary.numbered++;
  }

  // Rooms.
  const roomed = labelledBy(input.existing, ROOM_TYPE_ID);
  const rings = [...input.elements.map((e) => e.ring), ...swings.map((s) => s.ring)];
  const ringIndex = new RectIndex<readonly Pt[]>(4 * at.textHeight);
  for (const ring of rings) ringIndex.add(ringBounds(ring), ring);
  const seen = new Set<string>();
  for (const { room, shown } of rooms) {
    if (seen.has(room.guid)) continue;
    seen.add(room.guid);
    if (roomed.has(room.guid)) { summary.already++; continue; }
    const fromModel = modelArea(read, room.guid) !== undefined;
    const extras: LabelExtras = fromModel ? {} : { computedArea: ringArea(room.ring) };
    const size = labelSize(input.types.room, room.guid, at.textHeight, at.locale, extras, read);
    if (!size) continue;
    const spot = roomLabelPoint(shown, size.w, size.h, { rects: [], rings: [], rectIndex: roomIndex, ringIndex }, clear);
    const draft = labelDraft(input.types.room, room.guid, spot.centre, at, undefined, extras, read);
    if (!draft) continue;
    drafts.push(draft);
    roomIndex.add(growRect(rectAround(spot.centre, size.w, size.h), 0));
    summary.rooms++;
    if (fromModel) summary.areaFromModel++; else summary.areaFromFootprint++;
    if (!spot.fits) summary.roomsTooSmall++;
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

