/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The scale a sheet states (`{Scale}` in a title block, the drawing register's
 * column, the sheet's setup): one copy, read by the app and by the engine's
 * PDF, so a title block cannot say one thing on screen and another on paper.
 */

import { hasTrueScale } from './axonometric.js';
import type { ProjectSheet, ProjectView } from './document.js';

/** The scale text of one sheet: `1:50`; `asIndicated` when its drawings differ in scale; empty when it has none. `notDrawings` are the viewport ids that carry no drawing (schedules). */
export function sheetScaleText(sheet: Pick<ProjectSheet, 'viewports'>, notDrawings: ReadonlySet<string> = new Set(), asIndicated = 'As indicated'): string {
  const scales = [...new Set((sheet.viewports ?? []).filter((v) => !notDrawings.has(v.viewId)).map((v) => v.scale))].sort((a, b) => a - b);
  return scales.length > 1 ? asIndicated : scales.map((s) => `1:${s}`).join('');
}

/**
 * What the title block's `{Scale}` prints: the sheet's scale, a dash when it states none. A perspective has no scale to state, so
 * its viewport does not count; nor do `notDrawings`.
 */
export function sheetScaleLine(sheet: Pick<ProjectSheet, 'viewports'>, views: readonly ProjectView[], notDrawings: ReadonlySet<string> = new Set(), asIndicated = 'As indicated'): string {
  const unscaled = new Set(notDrawings);
  for (const v of sheet.viewports ?? []) if (!hasTrueScale(views.find((x) => x.id === v.viewId))) unscaled.add(v.viewId);
  return sheetScaleText(sheet, unscaled, asIndicated) || '—';
}
