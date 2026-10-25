/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pen of one drawing item (a line or a cut face) when something more specific than its category speaks for it: its phase
 * (`phases.ts`) and, over that, its element's own graphics in this view (#32). ONE function, so the drafting view's canvas and the
 * sheet's pens (`viewport-pens.ts`, hence the PDF and DXF) read the same colour, weight, dash and fill.
 *
 * `styledDrawing` marks an item with its phase and, for an element the view overrides, with `elementStyle` (the engine's
 * `resolveElementGraphics`). A field the pen leaves out is not decided here: the caller keeps the category's.
 */

import type { ElementStyle } from '@bimvoice/ifcsheet';
import { graphicStandardOf, type GraphicStandard } from '@/drafting/graphic-standard';
import { phaseInk } from './phases';
import { useProjectStore } from './project-store';
import type { PhaseId, ViewGraphics } from './types';

export interface ItemPen {
  color?: string;
  fill?: string;
  /** Dash in paper millimetres; `[]` is solid. Absent: the caller's. */
  dash?: number[];
  /** The pen in paper millimetres for THIS item: a cut face's outline or cut line at the cut weight, a line seen beyond the cut at the projection weight. */
  mm?: number;
}

/** A dashed line's pattern, paper millimetres (a dashed phase draws the same). */
export const DASH_MM = [3, 1.5];

type Marked = { phase?: PhaseId; elementStyle?: ElementStyle; category?: string };

/** `item`'s pen, or null when it has no phase and no element graphics. `weights`: what a weight word means as a pen, from the graphic standard (the project's, unless the caller has its own: the sheet's pens pass theirs). */
export function itemPen(graphics: ViewGraphics | undefined, item: object, weights: GraphicStandard['weights'] = graphicStandardOf(useProjectStore.getState().graphicStandard).weights): ItemPen | null {
  const { phase, elementStyle, category } = item as Marked;
  if (!phase && !elementStyle) return null;
  // A line is "cut" when the generator says so; a cut face's outline (no category) is cut too.
  const cut = category === undefined || category === 'cut';
  const pen: ItemPen = {};
  if (phase) {
    const ink = phaseInk(graphics, phase);
    pen.color = ink.color;
    pen.fill = ink.fill;
    pen.dash = ink.dash;
    pen.mm = ink.weightMm * (cut ? 1 : 0.5);
  }
  // The element's word is the most specific: it wins over the phase's, field by field. Without a phase the engine's layering
  // (template < category < element) is the answer; with one, the phase sits between the category and the element, so only what
  // the element itself says goes over it.
  const e = elementStyle ? (phase ? elementStyle.own : elementStyle) : null;
  if (e) {
    if (e.lineColor) pen.color = e.lineColor;
    if (e.fillColor) pen.fill = e.fillColor;
    if (e.lineStyle) pen.dash = e.lineStyle === 'dashed' ? DASH_MM : [];
    const weight = cut ? e.cutWeight : e.projectionWeight;
    if (weight) pen.mm = weights[weight][cut ? 'cut' : 'projection'];
  }
  return pen;
}
