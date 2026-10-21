/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model's starting set laid out as sheets of shapes, ready for
 * `exportPdf` and `exportDxf`.
 */

import type { DefaultSet } from './default-set.js';
import type { ProjectView } from './document.js';
import type { OpenedModel } from './model.js';
import { sheetGraphic, type SheetGraphic } from './sheet-graphic.js';
import { generateViewDrawings } from './view-drawings.js';

export interface SheetGraphicsOptions {
  /** Cut each view's drawing from the meshes (default true); without it the sheets carry their frames and titles only. */
  drawings?: boolean;
  /** A view whose drawing could not be made; the sheet keeps its title. */
  onDrawingError?: (view: ProjectView, error: unknown) => void;
}

/** Every sheet of `set` as shapes on its paper, in set order, the drawings cut from `model`'s meshes. */
export async function sheetGraphics(set: DefaultSet, model: Pick<OpenedModel, 'meshes' | 'extent'>, options: SheetGraphicsOptions = {}): Promise<SheetGraphic[]> {
  const { document: doc, levels } = set;
  const hung = new Set(doc.sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const drawings = options.drawings === false || !model.extent ? new Map()
    : await generateViewDrawings(doc.views.filter((v) => hung.has(v.id)), model.meshes, levels, model.extent, options.onDrawingError);
  return doc.sheets.map((sheet) => sheetGraphic(sheet, doc, drawings));
}
