/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Why a sheet is at its scale: one line the Wall and the DRAFTSET command both say (#20). */

import { paperLabel } from './paper.js';
import { SET_PAPER, SET_SCALES, drawingArea, fittingScale, fitsScale, sheetGroup, viewExtent, type ModelExtent } from './drawing-set.js';
import type { ProjectSheet, ProjectView } from './document.js';

/** A sentence kept as data: a catalogue key and its parameters, translated where it is shown. */
export interface Reason {
  key: 'wall.reason.noFit' | 'wall.reason.fits' | 'wall.reason.shared' | 'wall.reason.chosen';
  params: Record<string, string | number>;
}

/**
 * Why a sheet is at its scale, in one line (concept B's reason, #20): the
 * most detailed scale its drawings fit at on its paper, one somebody chose,
 * or the smallest scale there is when the drawings are still larger than
 * the paper. The Wall and the DRAFTSET command both say this one line.
 * A scale coarser than the sheet's own fit, that another sheet of its group is
 * drawn at too, is the group's shared one (a starter set draws a kind at one
 * scale, #634). `null` for a sheet whose drawings do not share one scale.
 */
export function sheetScaleReason(sheet: ProjectSheet, views: readonly ProjectView[], extent: ModelExtent, others: readonly ProjectSheet[] = []): { scale: number; fits: boolean; reason: Reason } | null {
  const vps = sheet.viewports ?? [];
  const scales = new Set(vps.map((v) => v.scale));
  if (scales.size !== 1) return null;
  const [scale] = scales;
  const members = vps.flatMap((vp) => views.find((v) => v.id === vp.viewId) ?? []);
  // A schedule or legend sets its own size: there is no scale to explain.
  if (members.length !== vps.length) return null;
  const paper = paperLabel(sheet.paper ?? SET_PAPER);
  const sizes = members.map((v) => viewExtent(v, extent));
  const area = drawingArea(sheet);
  const fits = fittingScale(sizes, area) === scale;
  const reason: Reason = !fitsScale(sizes, area, scale) && scale === SET_SCALES[SET_SCALES.length - 1]
    ? { key: 'wall.reason.noFit', params: { scale, paper } }
    : fits ? { key: 'wall.reason.fits', params: { scale, paper } }
      : sharedWith(sheet, scale, others) ? { key: 'wall.reason.shared', params: { scale } } : { key: 'wall.reason.chosen', params: { scale } };
  return { scale, fits, reason };
}

/** Whether another sheet of `sheet`'s group draws all its drawings at `scale`. */
function sharedWith(sheet: ProjectSheet, scale: number, others: readonly ProjectSheet[]): boolean {
  const group = sheetGroup(sheet);
  return group !== null && others.some((o) => o.id !== sheet.id && sheetGroup(o) === group && (o.viewports ?? []).length > 0 && (o.viewports ?? []).every((vp) => vp.scale === scale));
}
