/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The reference under a section symbol's letter, "1 / A-301": made fresh from the project every time a sheet is drawn and never
 * stored, so the plan's own drafts are not touched when a drawing moves to another sheet or is renumbered. A section whose
 * drawing is on no sheet prints nothing more: it keeps its letter alone. Pure. The app's sheet and the engine's (`sheetGraphic`,
 * so the PDF, the DXF and `ifcsheet build`) both place the references here (#619).
 */

import type { MarkStyle } from '../graphic-standard.js';
import type { DimAllMeasure } from '../dimall/measure.js';
import { textBoxIn } from '../dimall/measure.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import type { ProjectSheet, ProjectView } from '../document.js';
import { anchorFor, boxesOverlap, boxOfPoints, centreOf, halfAlong, type CrossRefBox } from './boxes.js';
import { referenceLabel, viewReference } from './reference.js';
import { markHeadReach, placementOf, sectionLink, sectionNormal, symbolParts, withoutSectionLink } from './section-geometry.js';

type SheetLike = Pick<ProjectSheet, 'number' | 'viewports'>;

/** Text of a reference, as a share of the letter it stands beside. */
const REF_TEXT_SHARE = 0.8;
/** Id suffix of a derived draft, so it never collides with a stored one. */
export const XREF = '~xref';

/** The section a drafted shape names with a reference beside it: a letter of a section symbol linked to a section view. */
function namedSection(d: DraftEntity, views: readonly ProjectView[]): string | null {
  const id = sectionLink(d);
  return id && d.shape.type === 'text' && views.find((v) => v.id === id)?.kind === 'section' ? id : null;
}

/** The sections the letters among `drafts` name, by view id (the views whose "n / sheet" the plan's references print). */
export function namedSections(drafts: readonly DraftEntity[], views: readonly ProjectView[]): string[] {
  const ids = new Set<string>();
  for (const d of drafts) {
    const id = namedSection(d, views);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Clear space kept round a section reference, as a share of its text height. */
const REF_MARGIN_SHARE = 0.4;
/** How far a section reference may slide off its place, in its text heights, and the step it slides by. */
const REF_SLIDE_REACH = 14;
const REF_SLIDE_STEP = 0.5;

export interface SectionReferenceOptions {
  /** How a text is measured and which way the plan's screen runs (`DimAllMeasure`). */
  measure: DimAllMeasure;
  /** What the reference keeps clear of besides the references placed before it: the plan's door and window symbols (`overlayObstacleBoxes`). */
  obstacles?: readonly CrossRefBox[];
  /** Model metres per paper millimetre in the viewport, and the viewport's scale over the plan's own: the text prints at `height * factor`. */
  paperUnit?: number;
  factor?: number;
  /** How the section symbols are headed (the project's graphic standard); absent: the arrow. */
  markStyle?: MarkStyle;
}

/**
 * For each letter of a section symbol whose section is on a sheet, a text just
 * beyond it reading where the section is drawn ("1 / A-301"). Nothing for a
 * section on no sheet, which keeps its letter alone. A reference whose box
 * meets an obstacle or a reference placed before it slides sideways along the
 * section's end (then a step further out) to the nearest place that is clear.
 */
export function sectionReferenceDrafts(
  drafts: readonly DraftEntity[], views: readonly ProjectView[], sheets: readonly SheetLike[], options: SectionReferenceOptions,
): DraftEntity[] {
  const { measure } = options;
  const viewIds = new Set(views.map((v) => v.id));
  const out: DraftEntity[] = [];
  const normals = new Map<string, Pt | null>();
  const factor = options.factor ?? 1;
  const taken: CrossRefBox[] = [...(options.obstacles ?? [])];
  // The box every text on the plan prints in, read once for all its letters (#154).
  let letterBoxes: (CrossRefBox | null)[] | null = null;
  for (const d of drafts) {
    const id = namedSection(d, views);
    const ref = id ? viewReference(id, viewIds, sheets) : null;
    if (!id || !ref || d.shape.type !== 'text') continue;
    if (!normals.has(id)) {
      const place = placementOf(symbolParts(drafts, id));
      normals.set(id, place ? sectionNormal(place.a, place.b, place.side) : null);
    }
    const n = normals.get(id);
    if (!n) continue;
    letterBoxes ??= drafts.map((o) => (o.shape.type === 'text' ? boxOfPoints(textBoxIn(measure, o.shape.p, o.shape.text, o.shape.height * factor, o.shape.rotation)) : null));
    const letter = d.shape;
    const label = referenceLabel(ref);
    const height = letter.height * REF_TEXT_SHARE;
    const letterBox = textBoxIn(measure, letter.p, letter.text, letter.height, letter.rotation);
    const c0 = centreOf(letterBox);
    // The reference starts past the letter and past the head round it: a circle and its triangle, a flag and its point (#447).
    const reach = Math.max(halfAlong(letterBox, n), markHeadReach(options.markStyle ?? 'arrow', letter.height, halfAlong(letterBox, n))) + halfAlong(textBoxIn(measure, { x: 0, y: 0 }, label, height, 0), n) + height * 0.3;
    const home = anchorFor(measure, { x: c0.x + n.x * reach, y: c0.y + n.y * reach }, label, height, 0);
    // The box it prints in: the text is drawn at `height * factor` about its anchor.
    const boxAt = (p: Pt): CrossRefBox => boxOfPoints(textBoxIn(measure, p, label, height * factor, 0));
    const margin = REF_MARGIN_SHARE * height * factor;
    const step = REF_SLIDE_STEP * height * factor;
    const along = { x: -n.y, y: n.x };
    const spots: { p: Pt; cost: number }[] = [];
    for (let outward = 0; outward <= 3; outward++) {
      for (let k = -REF_SLIDE_REACH * 2; k <= REF_SLIDE_REACH * 2; k++) {
        const s = k * step, o = outward * step * 2;
        spots.push({ p: { x: home.x + along.x * s + n.x * o, y: home.y + along.y * s + n.y * o }, cost: Math.hypot(s, o) });
      }
    }
    // The other letters on the plan are in the way too, the next section's among them.
    const blocked = [...taken, ...letterBoxes.filter((b, i): b is CrossRefBox => b !== null && drafts[i] !== d)];
    // Each spot's box once, not once per box it is tested against (#154).
    const best = spots.sort((a, b) => a.cost - b.cost).find(({ p }) => {
      const box = boxAt(p);
      return blocked.every((t) => !boxesOverlap(box, t, margin));
    });
    const p = best?.p ?? home;
    taken.push(boxAt(p));
    out.push({ ...d, id: `${d.id}${XREF}`, params: withoutSectionLink(d.params), shape: { type: 'text', p, text: label, height, rotation: 0 } });
  }
  return out;
}

