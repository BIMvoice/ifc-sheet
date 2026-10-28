/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A sheet laid out again when a viewport's scale changes (#450). The layout is the generated set's own (`placeViewports`
 * and `scaleOn`): one scale for the sheet, the drawings in a row (or a column on a portrait sheet), centred. Whether the
 * person has arranged the sheet by hand is read from the sheet itself, not from a flag: a sheet whose viewports sit
 * exactly where `placeViewports` puts them at their one scale was never touched, and one that does not was.
 */

import type { ProjectSheet, ProjectView, SheetViewport } from './document.js';
import { placeViewports, scaleOn, viewExtent, type ModelExtent } from './drawing-set.js';
import { isRescaledNote, rescaledNote } from './sheet-notes.js';

/** Closer than this (mm on the paper) is the same place: a drag is never this small. */
const SAME_PLACE_MM = 0.5;
/** The same drawing point (metres). */
const SAME_CENTRE_M = 0.01;

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** The views of a sheet's viewports in order; null when a viewport is not a plain view (a schedule, a legend), or is a continuation page or a key plan. */
function membersOf(sheet: ProjectSheet, views: readonly ProjectView[]): ProjectView[] | null {
  const members: ProjectView[] = [];
  for (const vp of sheet.viewports ?? []) {
    const view = views.find((v) => v.id === vp.viewId);
    if (!view || (vp.page ?? 0) > 0 || vp.keyPlanOf !== undefined) return null;
    members.push(view);
  }
  return members.length > 0 ? members : null;
}

/**
 * Whether `sheet` stands as the layout rule left it: every viewport is a plain view at one scale, fitted to its drawing
 * (no crop), at the place `placeViewports` gives it, showing the drawing's own centre. A moved, resized, cropped, panned or
 * differently scaled viewport makes the sheet the person's.
 */
export function sheetIsAsLaid(sheet: ProjectSheet, views: readonly ProjectView[], extent: ModelExtent): boolean {
  const members = membersOf(sheet, views);
  const vps = sheet.viewports ?? [];
  if (!members) return false;
  const scale = vps[0].scale;
  if (vps.some((vp) => vp.scale !== scale || vp.width > 0 || vp.height > 0)) return false;
  const laid = placeViewports(members, members.map((v) => viewExtent(v, extent)), scale, sheet, extent);
  return vps.every((vp, i) => {
    const want = laid[i];
    if (!near(vp.x, want.x, SAME_PLACE_MM) || !near(vp.y, want.y, SAME_PLACE_MM)) return false;
    if (vp.center === null || want.center === null) return vp.center === want.center;
    return near(vp.center.x, want.center.x, SAME_CENTRE_M) && near(vp.center.y, want.center.y, SAME_CENTRE_M);
  });
}

export interface SheetRelayout {
  viewports: SheetViewport[];
  /** The scale the drawings are laid at: `wanted` when they fit the paper at it, else the nearest that fits (`scaleOn`). */
  scale: number;
  /** The sheet's notes: those it had, less a stale rescaled note, plus one when `scale` is not `wanted`. */
  notes: string[];
}

/**
 * The viewports of `sheet` laid out again at `wanted`, by the rule the generated set uses. The paper is never changed to
 * save a scale; when the drawings do not fit it at `wanted` they are laid at the scale that fits and the sheet says so,
 * as a template's sheet does. Null when the sheet holds something the rule does not lay (a schedule, a continuation page).
 */
export function relaySheet(sheet: ProjectSheet, views: readonly ProjectView[], extent: ModelExtent, wanted: number, locale?: string): SheetRelayout | null {
  const members = membersOf(sheet, views);
  if (!members) return null;
  const sizes = members.map((v) => viewExtent(v, extent));
  const scale = scaleOn(sizes, sheet, wanted);
  const viewports = placeViewports(members, sizes, scale, sheet, extent).map((vp, i) => {
    const old = (sheet.viewports ?? [])[i];
    // The viewport keeps its identity, and what is about the drawing rather than its place (hidden layers, number).
    return { ...old, x: vp.x, y: vp.y, scale, width: 0, height: 0, center: vp.center };
  });
  const notes = (sheet.notes ?? []).filter((n) => !isRescaledNote(n));
  if (scale !== wanted && typeof sheet.paper === 'string') notes.push(rescaledNote(locale, sheet.paper, wanted, scale));
  return { viewports, scale, notes };
}
