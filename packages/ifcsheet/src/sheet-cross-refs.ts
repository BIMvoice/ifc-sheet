/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cross-reference marks of a plan viewport on a sheet (#619): a section's "1 / A-301" beside its letter and the elevation marks round
 * the ground plan, made from the document's views and sheets by the one code the app's sheet uses (`cross-ref/`), then drawn like any
 * drafted text and line (`viewportAnnotations`), so the PDF, the DXF and `ifcsheet build` carry them. Never stored.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { tableMeasure } from './dimall/measure.js';
import { openingObstacles } from './dimall/plan-obstacles.js';
import { DEFAULT_DRAFT_LAYER } from './default-draft-layer.js';
import type { ProjectDocument, SheetViewport } from './document.js';
import { inDrawOrder } from './draw-order.js';
import { styleBookOf } from './style-fit.js';
import { elevationMarkPlan } from './cross-ref/elevation-marks.js';
import { crossReferenceMarks } from './cross-ref/plan.js';
import type { OpeningSymbol } from './opening-symbols.js';
import type { SheetAnnotations } from './sheet-annotations.js';
import type { SheetLocale } from './units-and-numbers.js';

/**
 * The marks of `vp`'s view as annotations to print: the project's layers and styles (a set that carries none gets the standard layer and
 * styles, as `annotationsOf` does) with the marks as the only drafts. `null` when the view has no marks. `symbols` are the plan's door
 * and window symbols the marks keep clear of. They stand outside the building, past the viewport's box (which frames the drawing, as the
 * app's fit frames its marks too), so the sheet clips them to its drawing area, not to the box.
 */
export function crossRefAnnotations(
  annotations: SheetAnnotations | undefined,
  input: { doc: Pick<ProjectDocument, 'views' | 'sheets'>; vp: SheetViewport; drawing: Pick<Drawing2D, 'bounds'>; symbols: readonly OpeningSymbol[] | undefined; locale: SheetLocale },
): SheetAnnotations | null {
  const { doc, vp, drawing } = input;
  const view = doc.views.find((v) => v.id === vp.viewId);
  if (!view || view.kind !== 'plan' || vp.keyPlanOf !== undefined) return null;
  const own = inDrawOrder((annotations?.drafts ?? []).filter((d) => d.viewId === view.id), annotations?.layers ?? [DEFAULT_DRAFT_LAYER]);
  const marks = crossReferenceMarks({
    drafts: own, view, views: doc.views, sheets: doc.sheets, groundPlanId: elevationMarkPlan(doc.views)?.id, bounds: drawing.bounds,
    viewportScale: vp.scale, symbols: input.symbols ? openingObstacles(input.symbols) : [], measure: tableMeasure,
  });
  if (marks.length === 0) return null;
  return annotations ? { ...annotations, drafts: marks } : { drafts: marks, layers: [DEFAULT_DRAFT_LAYER], groups: [], book: styleBookOf(undefined, undefined), locale: input.locale };
}
