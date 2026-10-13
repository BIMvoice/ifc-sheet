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
import { growRect, rectAround, ringBounds, unionRect, type Rect } from '@/labels/label-geometry';
import { candidateCentres, orientedBox } from '@/labels/label-candidates';
import { layoutLabels, LABEL_CLEAR_MM, LABEL_GAP_MM, type LayoutElement } from '@/labels/label-layout';
import { DISPLACED_MM } from '@/labels/label-leader';
import type { LabelTarget } from '@/labels/label-place';
import { readFieldValue } from '@/labels/label-resolve';
import { parseFieldRef } from '@/labels/label-template';
import type { ViewElement } from '@/labels/view-elements';
import { clipLoop } from '@/project/drawing-crop';
import { RectIndex } from '@/labels/rect-index';
import { pieceRects, symbolPieces, type SymbolPiece } from '@/dimall/avoid';
import type { LabelElement } from '@/labels/label-resolve';
import { assignMarkCodes, hasOwnMark, type MarkSubject } from './mark-codes';
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
  /** A detail's area, drawing metres: only what is seen in it is labelled, and every label stands inside it. */
  crop?: { min: Pt; max: Pt };
  /** What the plan draws that labels keep clear of (`drafting/plan-obstacles.ts`). */
  obstacles?: { drawn: readonly SymbolPiece[]; linework: readonly SymbolPiece[] };
  /** The codes the project's door and window marks already carry, by kind. */
  knownCodes?: ReadonlyMap<string, string>;
  /** Marks that mean something else: the catalogue's door and window types. A code made for a kind never repeats one. */
  reservedMarks?: Iterable<string>;
}

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
  const summary: TagAllSummary = { marks: 0, coded: 0, kinds: 0, rooms: 0, areaFromModel: 0, areaFromFootprint: 0, roomsTooSmall: 0, already: 0, noRooms: rooms.length === 0 };
  const drafts: DraftEntity[] = [];
  const clear = LABEL_CLEAR_MM * at.paperUnit;
  const gap = LABEL_GAP_MM * at.paperUnit;

  // Doors and windows: each shows the model's short mark, else the code of its kind.
  const marked = labelledBy(input.existing, MARK_TYPE_ID);
  const openings = input.targets.filter((t) => isOpening(t.className));
  const firstSeen = new Set<string>();
  const todo = openings.filter((t) => !marked.has(t.guid) && !firstSeen.has(t.guid) && !!firstSeen.add(t.guid));
  summary.already += openings.length - todo.length;
  const codes = assignMarkCodes(todo.flatMap((t) => { const el = read(t.guid); return el ? [subjectOf(t, el)] : []; }), input.knownCodes, [...(input.reservedMarks ?? []), ...openings.flatMap((t) => { const m = String(read(t.guid)?.attribute('Mark') ?? '').trim(); return hasOwnMark(m) ? [m] : []; })]);
  const extrasOf = new Map<string, LabelExtras>();
  for (const [guid, c] of codes) if (c.key !== null) extrasOf.set(guid, { markCode: c.code, markKey: c.key });
  const centre = viewCentre(input.elements);
  const items = todo.flatMap((t) => {
    const size = labelSize(input.types.mark, t.guid, at.textHeight, extrasOf.get(t.guid), read);
    return size ? [{ id: String(t.renderId), ring: t.ring, ...size, ...(/^ifcdoor/i.test(t.className) ? { preferred: besideDoor(t.ring, size.w, size.h, gap, centre) } : {}) }] : [];
  });
  // What a label keeps clear of besides the elements' outlines: the room a door swings through, and what the plan draws over its cut.
  const swings = input.targets.filter((t) => /^ifcdoor/i.test(t.className)).map((t): LayoutElement => ({ id: String(t.renderId), ring: swingOf(t.ring) }));
  // The drawing's own lines are obstacles too (a partition wall a door mark would lie on), except an opening's own,
  // and for a window mark: outside the building the drawing has lines (roof edges seen from the plan) that are no reason to go inside.
  const own = openings.map((t) => growRect(ringBounds(t.ring), 2 * gap));
  const inRect = (b: Rect, p: Pt) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
  const linework = pieceRects((input.obstacles?.linework ?? []).filter((p) => !own.some((b) => inRect(b, p.a) && inRect(b, p.b))), 0.2 * at.textHeight);
  const drawn = pieceRects([...symbolPieces(input.existing), ...(input.obstacles?.drawn ?? [])], 0.2 * at.textHeight);
  // Everything a label keeps clear of sits on one grid (`labels/rect-index.ts`): a place is tested against the boxes near it, not against every line the plan draws.
  const index = new RectIndex(4 * at.textHeight);
  for (const r of [...rectsOf(input.existing), ...drawn]) index.add(r);
  const scene = { elements: [...input.elements.map((e): LayoutElement => ({ id: String(e.renderId), ring: e.ring })), ...swings], annotations: index, paperUnit: at.paperUnit };
  const doorIds = new Set(openings.filter((t) => /^ifcdoor/i.test(t.className)).map((t) => String(t.renderId)));
  // Windows first, on what the plan draws; the doors then also keep clear of the drawing's lines and of the windows' marks (placed ones join the grid).
  const windowSpots = layoutLabels(items.filter((i) => !doorIds.has(i.id)), scene);
  for (const r of linework) index.add(r);
  const doorSpots = layoutLabels(items.filter((i) => doorIds.has(i.id)), scene);
  const spots = new Map([...windowSpots, ...doorSpots]);
  const shownKinds = new Set<string>();
  for (const t of todo) {
    const spot = spots.get(String(t.renderId));
    const extras = extrasOf.get(t.guid) ?? {};
    const draft = spot ? labelDraft(input.types.mark, t.guid, spot.centre, at, t.ring, extras, read) : null;
    if (!draft || !spot || !within(input.crop, spot.centre)) continue;
    drafts.push(draft);
    summary.marks++;
    if (extras.markCode !== undefined) { summary.coded++; shownKinds.add(String(extras.markKey)); }
  }
  summary.kinds = shownKinds.size;

  // Rooms: in the middle of the room; a room too small for its label has the label beside it, joined by a leader.
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
    const size = labelSize(input.types.room, room.guid, at.textHeight, extras, read);
    if (!size) continue;
    const spot = roomLabelPoint(shown, size.w, size.h, { rects: [], rings: [], rectIndex: index, ringIndex }, clear);
    let place = spot.centre;
    if (!spot.fits) {
      // Outside the room, at the nearest free place round it.
      // Far enough from the room to count as displaced, so the label carries its leader.
      const box = orientedBox(shown);
      const preferred = candidateCentres({ box, ...size, gap: (DISPLACED_MM + LABEL_GAP_MM) * at.paperUnit, away: { x: box.c.x - centre.x, y: box.c.y - centre.y } });
      const outside = layoutLabels([{ id: `room:${room.guid}`, ring: shown, ...size, preferred }], scene);
      place = outside.get(`room:${room.guid}`)?.centre ?? place;
    }
    const draft = labelDraft(input.types.room, room.guid, place, at, shown, extras, read);
    if (!draft) continue;
    drafts.push(draft);
    if (spot.fits) index.add(growRect(rectAround(place, size.w, size.h), 0));
    summary.rooms++;
    if (fromModel) summary.areaFromModel++; else summary.areaFromFootprint++;
    if (!spot.fits) summary.roomsTooSmall++;
  }
  return { drafts, summary };
}

const subjectOf = (t: LabelTarget, el: LabelElement): MarkSubject => {
  const b = ringBounds(t.ring);
  return { guid: t.guid, className: t.className, mark: String(el.attribute('Mark') ?? ''), typeName: el.typeName(), name: String(el.attribute('Name') ?? ''), width: Math.max(b.x1 - b.x0, b.y1 - b.y0) };
};

const viewCentre = (elements: readonly ViewElement[]): Pt => {
  const bs = elements.map((e) => ringBounds(e.ring));
  const all = unionRect(bs);
  return all ? { x: (all.x0 + all.x1) / 2, y: (all.y0 + all.y1) / 2 } : { x: 0, y: 0 };
};

/**
 * Where a door's mark goes, in order: on the room side of the wall (the side facing the middle of the building),
 * level with the door's jamb at either end, just clear of the leaf's reach; then the same on the far side. No leader needed.
 * The leaf sweeps only the width of the door along the wall, so beside the jamb is always clear of it.
 */
function besideDoor(ring: readonly Pt[], w: number, h: number, gap: number, centre: Pt): Pt[] {
  const box = orientedBox(ring);
  const inward = (box.c.x - centre.x) * box.v.x + (box.c.y - centre.y) * box.v.y > 0 ? -1 : 1;
  const out: Pt[] = [];
  for (const side of [inward, -inward]) {
    for (const end of [1, -1]) {
      const along = box.hu + gap + w / 2, across = side * (box.hv + gap + h / 2);
      out.push({ x: box.c.x + box.u.x * end * along + box.v.x * across, y: box.c.y + box.u.y * end * along + box.v.y * across });
    }
  }
  return out;
}

/** The ground a door leaf may sweep: its outline grown by its own length, to both sides of it. */
function swingOf(ring: readonly Pt[]): Pt[] {
  const b = ringBounds(ring);
  const w = b.x1 - b.x0, h = b.y1 - b.y0, reach = Math.max(w, h);
  const [gx, gy] = w >= h ? [0, reach] : [reach, 0];
  return [{ x: b.x0 - gx, y: b.y0 - gy }, { x: b.x1 + gx, y: b.y0 - gy }, { x: b.x1 + gx, y: b.y1 + gy }, { x: b.x0 - gx, y: b.y1 + gy }];
}


