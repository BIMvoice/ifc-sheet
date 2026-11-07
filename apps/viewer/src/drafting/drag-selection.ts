/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dragging a selection (#168): press on a drafted element that is already selected and drag, and the selection
 * follows the cursor, snapping as the drafting tools do. Alt leaves the originals and drops a copy; Esc puts it
 * back (nothing was changed yet). The release makes the same one edit as MOVE or COPY (`commands/modify.ts`), one
 * undo step. The state here is plain data; the pointer hook feeds it and draws its preview.
 */

import { entitySkeleton, translateEntity } from './annotation';
import { displaceDrafts, movableOf } from './commands/modify';
import { applyOrtho } from './input';
import { findSnap } from './snaps';
import { sub } from './vec';
import type { DraftEntity, DraftShape, Pt, SnapHit, SnapMode } from './types';

const MODES: ReadonlySet<SnapMode> = new Set<SnapMode>(['endpoint', 'intersection', 'midpoint', 'center', 'quadrant', 'perpendicular', 'nearest']);

export interface SelectionDrag {
  viewId: string;
  /** What a move takes (a section symbol whole, a detail's mark left out), and what a copy takes (the selection as it is). */
  moving: readonly DraftEntity[];
  copying: readonly DraftEntity[];
  copy: boolean;
  /** The point picked up (snapped), and where it is now. */
  from: Pt;
  to: Pt;
  snap: SnapHit | null;
}

/** How a dragged point lands: on what it may snap to (null: snapping off), within what distance, and whether ortho holds it. */
export interface DragAim {
  targets: readonly DraftShape[] | null;
  tolerance: number;
  ortho: boolean;
}

function snapped(raw: Pt, targets: readonly DraftShape[] | null, tolerance: number, from: Pt | null): SnapHit | null {
  return targets ? findSnap(raw, targets, null, { tolerance, modes: MODES, from }) : null;
}

/**
 * A drag that starts on `hit` at `raw`, or null when `hit` is not in the selection `ids` or nothing of it may move
 * (a press anywhere else is a click or a box, as before).
 */
export function startSelectionDrag(viewId: string, ids: ReadonlySet<string>, entities: readonly DraftEntity[], hit: DraftEntity | null, raw: Pt, aim: DragAim, copy: boolean): SelectionDrag | null {
  if (!hit || !ids.has(hit.id)) return null;
  const moving = movableOf(ids, entities).items;
  const copying = entities.filter((e) => ids.has(e.id));
  if ((copy ? copying : moving).length === 0) return null;
  const snap = snapped(raw, aim.targets, aim.tolerance, null);
  const from = snap?.point ?? raw;
  return { viewId, moving, copying, copy, from, to: from, snap: null };
}

/** The shapes a dragged point may snap to: everything but what is moving (a copy's originals stay, so they count). */
export function dragSnapTargets(shapes: readonly DraftShape[], drag: SelectionDrag): DraftShape[] {
  if (drag.copy) return [...shapes];
  const moving = new Set<unknown>(drag.moving.map((e) => e.shape));
  return shapes.filter((s) => !moving.has(s));
}

/** The drag with its point at `raw` (snapped, else held horizontal or vertical from where it began under ortho), copying or not. */
export function dragSelectionTo(drag: SelectionDrag, raw: Pt, aim: DragAim, copy: boolean): SelectionDrag {
  const snap = snapped(raw, aim.targets, aim.tolerance, drag.from);
  const to = snap?.point ?? (aim.ortho ? applyOrtho(drag.from, raw) : raw);
  return { ...drag, copy, to, snap };
}

const itemsOf = (drag: SelectionDrag): readonly DraftEntity[] => (drag.copy ? drag.copying : drag.moving);

/** Where the selection would land now, as outlines. */
export function selectionDragPreview(drag: SelectionDrag): DraftShape[] {
  const d = sub(drag.to, drag.from);
  return itemsOf(drag).flatMap((e) => entitySkeleton(translateEntity(e.shape, d)));
}

/**
 * Lets go: moves the selection, or drops a copy of it, by how far the point went, as one undo step. Returns what is
 * selected afterwards (the copies, after a copy), or null when nothing changed (the point did not go anywhere).
 */
export function commitSelectionDrag(drag: SelectionDrag): ReadonlySet<string> | null {
  const d = sub(drag.to, drag.from);
  if (d.x === 0 && d.y === 0) return null;
  const items = itemsOf(drag);
  const added = displaceDrafts(drag.copy ? 'copy' : 'move', drag.viewId, items, d);
  return new Set(drag.copy ? added : drag.copying.map((e) => e.id));
}
