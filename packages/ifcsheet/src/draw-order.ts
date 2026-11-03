/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What draws on top among the drafted elements of a view (#682), from one place: the screen, the sheet, the PDF and the DXF all
 * take the drafts through `inDrawOrder`, so they cannot stack them differently.
 *
 * The order is two things the project already holds. A layer's `order` (absent: 0) puts the whole layer above the layers with a
 * lower number; within a layer, and between layers of the same number, the drafts stack in the order they are stored in, the last
 * on top (the order they were drawn in, until "Bring to front" or "Send to back" moves one). Nothing is decided by the kind of
 * element: a hatch drawn over a line covers it, and a line drawn over a hatch is seen on it.
 */

import type { DraftLayer } from './draft-types.js';

/** The layer's place in the stack: higher draws above lower; a layer with none, or one the project does not have, is 0. */
export function layerOrder(layer: Pick<DraftLayer, 'order'> | undefined): number {
  return layer?.order ?? 0;
}

/** `drafts` bottom to top: by their layer's order, then as stored. A list no layer orders is returned as it is. */
export function inDrawOrder<E extends { layerId: string }>(drafts: readonly E[], layers: readonly DraftLayer[]): readonly E[] {
  const orders = new Map(layers.map((l) => [l.id, layerOrder(l)]));
  if (!layers.some((l) => layerOrder(l) !== 0)) return drafts;
  const at = (e: E): number => orders.get(e.layerId) ?? 0;
  return drafts.map((e, i) => ({ e, i, k: at(e) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.e);
}

/**
 * `drafts` with those whose id is in `ids` moved after all the others (to the front), or before all the others (to the back),
 * each keeping its place among the moved. The same array when nothing would move.
 */
export function movedInOrder<E extends { id: string }>(drafts: readonly E[], ids: ReadonlySet<string>, to: 'front' | 'back'): readonly E[] {
  const moving = drafts.filter((d) => ids.has(d.id));
  if (moving.length === 0) return drafts;
  const rest = drafts.filter((d) => !ids.has(d.id));
  const next = to === 'front' ? [...rest, ...moving] : [...moving, ...rest];
  return next.every((d, i) => d === drafts[i]) ? drafts : next;
}
