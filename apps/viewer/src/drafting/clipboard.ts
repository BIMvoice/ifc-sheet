/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting clipboard (Ctrl+C / Ctrl+V): the shapes of the entities copied,
 * kept as drawn, in the drawing units of the view they came from. A paste puts
 * them down at a clicked point; into a view of the same scale that keeps their
 * size, as the drawing units of a view are its model metres.
 */

import type { DraftEntity, DraftParamValue, EntityShape, Pt } from './types';
import { entityBounds } from './annotation';

export interface ClipItem {
  layerId: string;
  shape: EntityShape;
  params: Record<string, DraftParamValue>;
}

let items: readonly ClipItem[] = [];

/** Replace the clipboard with these entities (their shapes, layers and params; ids and view are not kept). */
export function setClipboard(entities: readonly DraftEntity[], params: (e: DraftEntity) => Record<string, DraftParamValue>): void {
  items = entities.map((e) => ({ layerId: e.layerId, shape: e.shape, params: params(e) }));
}

export const clipboardItems = (): readonly ClipItem[] => items;
export const clipboardEmpty = (): boolean => items.length === 0;
export function clearClipboard(): void {
  items = [];
}

/** The centre of everything on the clipboard: the point a paste holds at the cursor. */
export function clipboardAnchor(): Pt {
  const boxes = items.map((i) => entityBounds(i.shape));
  if (boxes.length === 0) return { x: 0, y: 0 };
  const min = { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)) };
  const max = { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)) };
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 };
}
