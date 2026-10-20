/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Wall is showing right now: where its sheets lie, which are near the
 * screen (those are drawn on the Wall; the rest hang as outlines), the queue of
 * sheets whose drawings are generated, and the two things the search box and the
 * corner map ask of the Wall: scroll somewhere, and flash a sheet.
 */

import { create } from 'zustand';
import type { ProjectSheet, ProjectView } from '@/project/types';
import type { ViewDrawingEntry } from '@/project/view-drawings';
import { drawnQueue, sameIds, visibleSheets, type PlacedSheet, type Rect, type Size } from './wall-geometry';

export interface WallLayout {
  sheets: PlacedSheet[];
  /** The part of the Wall on screen, in content px. */
  viewport: Rect;
  /** The whole Wall, px. */
  content: Size;
}

interface WallView {
  layout: WallLayout | null;
  /** Sheets near the screen, nearest first. */
  near: string[];
  /** Sheets whose drawings are generated: the near ones first, then those that were near. */
  queue: string[];
  highlight: string | null;
  /** A request to scroll the Wall so this point is in the middle; `n` makes each request new. */
  scroll: { n: number; to: { x: number; y: number } } | null;
}

export const useWallView = create<WallView>()(() => ({ layout: null, near: [], queue: [], highlight: null, scroll: null }));

/** How far past the screen a sheet still counts as near: half a screen each way. */
export function nearMargin(viewport: Size): number {
  return Math.max(viewport.w, viewport.h) / 2;
}

/** When the screen last moved, ms; the background fill waits for the Wall to hold still. */
let lastMoved = 0;
export const wallMovedAgo = (): number => Date.now() - lastMoved;
/** The screen moved, or the user clicked or typed: the background fill holds off a moment. */
export const noteWallMoved = (): void => {
  lastMoved = Date.now();
};

/** Counts `resetWallView` calls, so a background fill started for one project stops when another replaces it. */
let generation = 0;
export const wallViewGeneration = (): number => generation;

export function setWallLayout(layout: WallLayout | null): void {
  noteWallMoved();
  useWallView.setState((s) => {
    const near = layout ? visibleSheets(layout.sheets, layout.viewport, nearMargin(layout.viewport)) : [];
    const queue = drawnQueue(s.queue, near);
    return { layout, near: sameIds(near, s.near) ? s.near : near, queue: sameIds(queue, s.queue) ? s.queue : queue };
  });
}

/** Every sheet, nearest the screen first: the order the background fill draws the far ones in. */
export function fillOrder(layout: WallLayout): string[] {
  return visibleSheets(layout.sheets, layout.viewport, Infinity);
}

/** The first sheet in `order` not yet in `queue`, or null when every sheet is queued. */
export function nextToFill(order: readonly string[], queue: readonly string[]): string | null {
  const queued = new Set(queue);
  return order.find((id) => !queued.has(id)) ?? null;
}

/** Queue the next far sheet for drawing, in `unmeasured` order while no Wall is on screen; null when there is none. */
export function fillNext(unmeasured: readonly string[] = []): string | null {
  const { layout, queue } = useWallView.getState();
  const id = nextToFill(layout ? fillOrder(layout) : unmeasured, queue);
  if (id) useWallView.setState({ queue: [...queue, id] });
  return id;
}

/** The drawable views of queued sheets that have not finished generating (ready or failed). */
export function pendingViews(
  queue: readonly string[],
  sheets: readonly ProjectSheet[],
  views: readonly ProjectView[],
  byView: Record<string, Pick<ViewDrawingEntry, 'status'> | undefined>,
): string[] {
  const drawable = new Set(views.filter((v) => v.kind !== '3d').map((v) => v.id));
  const queued = new Set(queue);
  return sheets
    .filter((s) => queued.has(s.id))
    .flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId))
    .filter((id) => drawable.has(id) && byView[id]?.status !== 'ready' && byView[id]?.status !== 'error');
}

export function scrollWallTo(to: { x: number; y: number }): void {
  useWallView.setState((s) => ({ scroll: { n: (s.scroll?.n ?? 0) + 1, to } }));
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;
const FLASH_MS = 1800;

/** Scroll to a sheet and mark it for a moment. */
export function revealSheet(sheetId: string): void {
  const { layout } = useWallView.getState();
  const placed = layout?.sheets.find((s) => s.id === sheetId);
  if (placed) scrollWallTo({ x: placed.rect.x + placed.rect.w / 2, y: placed.rect.y + placed.rect.h / 2 });
  clearTimeout(flashTimer);
  useWallView.setState({ highlight: sheetId });
  flashTimer = setTimeout(() => useWallView.setState({ highlight: null }), FLASH_MS);
}

/** Forget the Wall: called when the project is reset or replaced, so no sheet of the last one stays queued. */
export function resetWallView(): void {
  generation++;
  clearTimeout(flashTimer);
  useWallView.setState({ layout: null, near: [], queue: [], highlight: null, scroll: null });
}

/**
 * The sheets whose viewports need their drawings generated: those open as a
 * tab, the one stepped into while the Wall is in front, and the queue (nearest
 * first), which the background fill keeps growing after the Wall is gone.
 */
export function sheetsToDraw(
  sheets: readonly ProjectSheet[],
  { wall, queue, stepped, open }: { wall: boolean; queue: readonly string[]; stepped: string | null; open: readonly string[] },
): ProjectSheet[] {
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const id of open) ids.add(id);
  if (wall && stepped) ids.add(stepped);
  for (const id of queue) ids.add(id);
  // Open and stepped-into sheets first: somebody is looking at them.
  return [...ids].map((id) => byId.get(id)).filter((s): s is ProjectSheet => !!s);
}
