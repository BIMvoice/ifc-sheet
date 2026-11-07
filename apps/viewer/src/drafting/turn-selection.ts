/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Turning a selection by its handle (#168): a small handle sits above the selection's box; drag it and the selection
 * turns about the box's centre, in 15° steps (Shift: by the degree). The release makes the same one edit as ROTATE
 * (`commands/modify.ts`), one undo step; Esc drops the turn and nothing has changed. What turns is what a move takes
 * (`movableOf`: a section symbol whole, a detail's mark left out). The state here is plain data; the pointer hook
 * feeds it and draws its preview.
 */

import { entityBounds, entitySkeleton, rotateEntity } from './annotation';
import { movableOf, rotateDrafts } from './commands/modify';
import { drawingToScreen, screenSigns, screenToDrawing, type SectionAxisName, type ViewTransform } from './frame';
import { isGeometry, type DraftEntity, type DraftShape, type Pt } from './types';
import { rotatePt } from './vec';

/** The step a turn snaps to, in degrees. */
export const TURN_STEP_DEG = 15;
/** How far above the selection's box the handle sits (screen px), and above the style bar of a single annotation. */
const HANDLE_GAP_PX = 26;
const HANDLE_GAP_STYLED_PX = 66;
/** How near the handle a press picks it up (screen px). */
const HANDLE_PICK_PX = 12;

/** What of the selection turns, about which point (drawing units), and where its handle sits (screen px). */
export interface TurnHandle {
  items: readonly DraftEntity[];
  centre: Pt;
  at: Pt;
}

export interface SelectionTurn {
  viewId: string;
  items: readonly DraftEntity[];
  centre: Pt;
  /** The direction from the centre to where the handle was picked up (drawing radians). */
  from: number;
  /** The turn now, in drawing radians, and in degrees counter-clockwise on screen (what the label shows). */
  angle: number;
  degrees: number;
  /** Drawing radians times this is counter-clockwise on screen (a plan draws drawing-y downward). */
  orientation: 1 | -1;
}

/** The single annotation's style bar sits above it (`SelectionBar`): the handle goes above that. */
function hasStyleBar(selected: readonly DraftEntity[]): boolean {
  if (selected.length !== 1) return false;
  const shape = selected[0].shape;
  return !isGeometry(shape) && shape.type !== 'hatch' && shape.type !== 'symbol';
}

/** The handle of the selection `ids`, or null when nothing of it may turn (only a detail's mark, say). */
export function turnHandleOf(ids: ReadonlySet<string>, entities: readonly DraftEntity[], t: ViewTransform, axis: SectionAxisName): TurnHandle | null {
  const { items } = movableOf(ids, entities);
  if (items.length === 0) return null;
  const boxes = items.map((e) => entityBounds(e.shape));
  const min = { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)) };
  const max = { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)) };
  const centre = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 };
  const top = Math.min(drawingToScreen(min, t, axis).y, drawingToScreen(max, t, axis).y);
  const gap = hasStyleBar(entities.filter((e) => ids.has(e.id))) ? HANDLE_GAP_STYLED_PX : HANDLE_GAP_PX;
  return { items, centre, at: { x: drawingToScreen(centre, t, axis).x, y: top - gap } };
}

/** True when the screen point `s` is on the handle. */
export function onTurnHandle(handle: TurnHandle, s: Pt): boolean {
  return Math.hypot(s.x - handle.at.x, s.y - handle.at.y) <= HANDLE_PICK_PX;
}

/** A turn picked up by `handle` at the drawing point `grab`. */
export function startSelectionTurn(viewId: string, handle: TurnHandle, grab: Pt, axis: SectionAxisName): SelectionTurn {
  const { kx, ky } = screenSigns(axis);
  const from = Math.atan2(grab.y - handle.centre.y, grab.x - handle.centre.x);
  return { viewId, items: handle.items, centre: handle.centre, from, angle: 0, degrees: 0, orientation: kx * -ky > 0 ? 1 : -1 };
}

/** The turn with the handle dragged to the drawing point `p`: snapped to 15° steps, or with `free` (Shift) to the degree. */
export function turnSelectionTo(turn: SelectionTurn, p: Pt, free: boolean): SelectionTurn {
  const raw = Math.atan2(p.y - turn.centre.y, p.x - turn.centre.x) - turn.from;
  // Counter-clockwise on screen, between -180° and 180°.
  let deg = ((raw * turn.orientation * 180) / Math.PI) % 360;
  if (deg > 180) deg -= 360;
  if (deg <= -180) deg += 360;
  const step = free ? 1 : TURN_STEP_DEG;
  const degrees = Math.round(deg / step) * step || 0;
  return { ...turn, degrees, angle: ((degrees * Math.PI) / 180) * turn.orientation };
}

/** Where the selection would land now, as outlines. */
export function selectionTurnPreview(turn: SelectionTurn): DraftShape[] {
  return turn.items.flatMap((e) => entitySkeleton(rotateEntity(e.shape, turn.centre, turn.angle)));
}

/** Where the handle is drawn while it is dragged: turned with the selection (screen px). */
export function turnedHandleAt(turn: SelectionTurn, handle: Pt, t: ViewTransform, axis: SectionAxisName): Pt {
  return drawingToScreen(rotatePt(screenToDrawing(handle, t, axis), turn.centre, turn.angle), t, axis);
}

/** Lets go: turns the selection in place, as ROTATE does, one undo step. False when the turn is 0° (nothing changed). */
export function commitSelectionTurn(turn: SelectionTurn): boolean {
  if (turn.degrees === 0) return false;
  rotateDrafts(turn.items, turn.centre, turn.angle);
  return true;
}
