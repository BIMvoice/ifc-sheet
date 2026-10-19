/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The marks that name the drawing they point at, "1 / A-301": the reference
 * under a section symbol's letter, and the elevation marks round the ground
 * plan. Both are made fresh from the project every time a sheet is drawn and
 * are never stored, so the plan's own drafts are not touched when a drawing
 * moves to another sheet or is renumbered. A mark whose target is on no sheet
 * prints nothing more: a section keeps its letter, an elevation has no mark.
 * Pure.
 */

import type { ElevationDirection, ProjectView } from '@/project/types';
import { textBox } from './annotation';
import { referenceLabel, viewReference } from './cross-ref';
import { placementOf, symbolParts } from './section-link';
import { sectionLink, sectionNormal, withoutSectionLink } from './section-symbol';
import type { DraftEntity, Pt } from './types';

/** Text of a reference, as a share of the letter it stands beside. */
const REF_TEXT_SHARE = 0.8;
/** Id suffix of a derived draft, so it never collides with a stored one. */
const XREF = '~xref';
/** Paper millimetres: the elevation mark's text height, its arrow, and the gap to the building. */
export const ELEVATION_TEXT_MM = 2.5;
const ARROW_MM = 3.5;
const GAP_MM = 1;

const centreOf = (box: Pt[]): Pt => ({ x: (box[0].x + box[2].x) / 2, y: (box[0].y + box[2].y) / 2 });

/** The anchor that puts the middle of `text` (at `height`, turned `rotation`) on `c`. */
function anchorFor(c: Pt, text: string, height: number, rotation: number): Pt {
  const mid = centreOf(textBox({ x: 0, y: 0 }, text, height, rotation));
  return { x: c.x - mid.x, y: c.y - mid.y };
}

/** Half the extent of a box along the unit direction `n`. */
function halfAlong(box: Pt[], n: Pt): number {
  const w = Math.hypot(box[1].x - box[0].x, box[1].y - box[0].y);
  const h = Math.hypot(box[3].x - box[0].x, box[3].y - box[0].y);
  const u = { x: (box[1].x - box[0].x) / (w || 1), y: (box[1].y - box[0].y) / (w || 1) };
  const v = { x: (box[3].x - box[0].x) / (h || 1), y: (box[3].y - box[0].y) / (h || 1) };
  return (Math.abs(n.x * u.x + n.y * u.y) * w + Math.abs(n.x * v.x + n.y * v.y) * h) / 2;
}

/**
 * For each letter of a section symbol whose section is on a sheet, a text just
 * beyond it reading where the section is drawn ("1 / A-301"). Nothing for a
 * section on no sheet, which keeps its letter alone.
 */
export function sectionReferenceDrafts(
  drafts: readonly DraftEntity[], views: readonly ProjectView[], sheets: Parameters<typeof viewReference>[2],
): DraftEntity[] {
  const viewIds = new Set(views.map((v) => v.id));
  const out: DraftEntity[] = [];
  const normals = new Map<string, Pt | null>();
  for (const d of drafts) {
    const id = sectionLink(d);
    if (!id || d.shape.type !== 'text') continue;
    const ref = views.find((v) => v.id === id)?.kind === 'section' ? viewReference(id, viewIds, sheets) : null;
    if (!ref) continue;
    if (!normals.has(id)) {
      const place = placementOf(symbolParts(drafts, id));
      normals.set(id, place ? sectionNormal(place.a, place.b, place.side) : null);
    }
    const n = normals.get(id);
    if (!n) continue;
    const letter = d.shape;
    const label = referenceLabel(ref);
    const height = letter.height * REF_TEXT_SHARE;
    const letterBox = textBox(letter.p, letter.text, letter.height, letter.rotation);
    const c0 = centreOf(letterBox);
    const reach = halfAlong(letterBox, n) + halfAlong(textBox({ x: 0, y: 0 }, label, height, 0), n) + height * 0.3;
    const p = anchorFor({ x: c0.x + n.x * reach, y: c0.y + n.y * reach }, label, height, 0);
    out.push({ ...d, id: `${d.id}${XREF}`, params: withoutSectionLink(d.params), shape: { type: 'text', p, text: label, height, rotation: 0 } });
  }
  return out;
}

/** The elevation direction → the side of the plan it is on, and the way its arrow points (drawing coordinates: a plan's y runs down the screen, north is up). */
const SIDES: Record<ElevationDirection, { out: Pt }> = {
  north: { out: { x: 0, y: -1 } },
  south: { out: { x: 0, y: 1 } },
  east: { out: { x: 1, y: 0 } },
  west: { out: { x: -1, y: 0 } },
};

export interface ElevationMarkInput {
  planViewId: string;
  layerId: string;
  views: readonly ProjectView[];
  sheets: Parameters<typeof viewReference>[2];
  /** The plan's drawing extent, drawing metres. */
  bounds: { min: Pt; max: Pt };
  /** Model metres per paper millimetre in the viewport that shows the plan (its scale over 1000). */
  paperUnit: number;
  /** The viewport's scale over the plan's own: annotation text is multiplied by it when drawn. */
  factor: number;
}

/**
 * An elevation mark on each side of the building that has an elevation on a
 * sheet: an arrowhead outside the extent pointing at the building, and the
 * target "n / sheet" beyond it (turned along the facade on east and west, where
 * there is no room beside it). North is the top of the plan.
 */
export function elevationMarkDrafts(input: ElevationMarkInput): DraftEntity[] {
  const { planViewId, layerId, views, sheets, bounds, paperUnit, factor } = input;
  const viewIds = new Set(views.map((v) => v.id));
  const mid = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 };
  const textH = ELEVATION_TEXT_MM * paperUnit;
  const out: DraftEntity[] = [];
  for (const view of views) {
    if (view.kind !== 'elevation' || view.detail) continue;
    const ref = viewReference(view.id, viewIds, sheets);
    if (!ref) continue;
    const { out: o } = SIDES[view.direction];
    const edge = o.x !== 0 ? (o.x > 0 ? bounds.max.x : bounds.min.x) : o.y > 0 ? bounds.max.y : bounds.min.y;
    // Along the outward axis: the arrow's tip, its base, then the label's middle. Across it: the middle of the facade.
    const tip = edge + (o.x + o.y) * GAP_MM * paperUnit;
    const base = tip + (o.x + o.y) * ARROW_MM * paperUnit;
    const at = (along: number, across: number): Pt => (o.x !== 0 ? { x: along, y: mid.y + across } : { x: mid.x + across, y: along });
    const half = (ARROW_MM / 2) * paperUnit;
    const lines: [Pt, Pt][] = [[at(tip, 0), at(base, -half)], [at(tip, 0), at(base, half)], [at(base, -half), at(base, half)]];
    const label = referenceLabel(ref);
    const rotation = o.x !== 0 ? Math.PI / 2 : 0;
    const box = textBox({ x: 0, y: 0 }, label, textH, rotation);
    const labelMid = base + (o.x + o.y) * (GAP_MM * paperUnit + halfAlong(box, o));
    const p = anchorFor(at(labelMid, 0), label, textH, rotation);
    const id = `${planViewId}:elevation:${view.id}${XREF}`;
    lines.forEach(([a, b], i) => out.push({ id: `${id}:${i}`, viewId: planViewId, layerId, shape: { type: 'line', a, b }, params: {} }));
    out.push({ id: `${id}:label`, viewId: planViewId, layerId, shape: { type: 'text', p, text: label, height: textH / factor, rotation }, params: {} });
  }
  return out;
}
