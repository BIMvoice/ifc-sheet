/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafting view: a drawing with no model behind it (a typical parapet, a
 * threshold), holding only drafts. Pure helpers; the actions that put one in
 * the project are in `drafting/commands/drafting-view.ts`.
 */

import type { NewProjectView, SheetViewport } from '@/project/types';
import { entityBounds } from './annotation';
import type { DraftEntity } from './types';

/** The scale a new drafting view starts at: details are drawn large. */
export const DEFAULT_DRAFTING_SCALE = 10;

export function draftingViewOf(name: string, scale = DEFAULT_DRAFTING_SCALE): NewProjectView {
  return { kind: 'drafting', name, scale, auto: false };
}

/** The extent of the drafts, drawing metres; `null` when there are none. */
export function draftsExtent(drafts: readonly Pick<DraftEntity, 'shape'>[]): { min: { x: number; y: number }; max: { x: number; y: number } } | null {
  if (drafts.length === 0) return null;
  const boxes = drafts.map((d) => entityBounds(d.shape));
  return {
    min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)) },
    max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)) },
  };
}

/** Margin round the drafts in a fitted viewport, paper millimetres. */
const FIT_MARGIN_MM = 10;

/**
 * The viewport framing of a drafting view at `scale`: centred on its drafts,
 * the box just holding them. A view with no drafts keeps the default frame
 * (a view without a model has no drawing to fit to).
 */
export function draftingFrame(drafts: readonly Pick<DraftEntity, 'shape'>[], scale: number): Pick<SheetViewport, 'center' | 'width' | 'height'> {
  const extent = draftsExtent(drafts);
  if (!extent) return { center: null, width: 0, height: 0 };
  const k = 1000 / scale;
  return {
    center: { x: (extent.min.x + extent.max.x) / 2, y: (extent.min.y + extent.max.y) / 2 },
    width: Math.max(40, (extent.max.x - extent.min.x) * k + FIT_MARGIN_MM * 2),
    height: Math.max(30, (extent.max.y - extent.min.y) * k + FIT_MARGIN_MM * 2),
  };
}
