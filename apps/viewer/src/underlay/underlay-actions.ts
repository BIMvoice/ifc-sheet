/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Changing the project's underlays (#457). Everything the panel and the UNDERLAYSCALE command do goes through
 * here, so a locked underlay is refused in one place: its position, scale and turn do not change until it is unlocked.
 */

import { freshProjectId } from '@/project/view-defaults';
import { useProjectStore } from '@/project/project-store';
import type { Pt } from '@/drafting/types';
import { scaleByTwoPoints, type ViewUnderlay } from './underlay';

/** What an import hands over: a reduced bitmap and where it came from. */
export type NewUnderlay = Pick<ViewUnderlay, 'viewId' | 'name' | 'kind' | 'href' | 'widthPx' | 'heightPx' | 'mPerPx'> & { page?: number; at?: Pt };

const all = (): readonly ViewUnderlay[] => useProjectStore.getState().underlays ?? [];

function commit(next: ViewUnderlay[]): void {
  useProjectStore.setState({ underlays: next.length > 0 ? next : undefined, dirty: true });
}

function change(id: string, edit: (u: ViewUnderlay) => ViewUnderlay | null): boolean {
  const current = all();
  const found = current.find((u) => u.id === id);
  const next = found ? edit(found) : null;
  if (!found || !next) return false;
  commit(current.map((u) => (u.id === id ? next : u)));
  return true;
}

/** Lays a bitmap under a view: centred on the origin of its drawing, half opaque, not printed, unlocked. Returns its id. */
export function addUnderlay(input: NewUnderlay): string {
  const id = freshProjectId('underlay');
  commit([...all(), { ...input, id, at: input.at ?? { x: 0, y: 0 }, rotation: 0, opacity: 0.5, locked: false }]);
  return id;
}

export function removeUnderlay(id: string): boolean {
  const current = all();
  if (!current.some((u) => u.id === id)) return false;
  commit(current.filter((u) => u.id !== id));
  return true;
}

/** Moves the centre, turns (radians) or sets the scale; refused when the underlay is locked or a value is not a number. */
export function placeUnderlay(id: string, placement: { at?: Pt; rotation?: number; mPerPx?: number }): boolean {
  const values = [placement.at?.x, placement.at?.y, placement.rotation, placement.mPerPx].filter((v) => v !== undefined);
  if (!values.every((v) => Number.isFinite(v)) || (placement.mPerPx !== undefined && !(placement.mPerPx > 0))) return false;
  return change(id, (u) => (u.locked ? null : { ...u, ...(placement.at ? { at: placement.at } : {}), ...(placement.rotation !== undefined ? { rotation: placement.rotation } : {}), ...(placement.mPerPx !== undefined ? { mPerPx: placement.mPerPx } : {}) }));
}

/** Sets the scale from two points picked on the picture and the distance between them in metres (`scaleByTwoPoints`). */
export function scaleUnderlay(id: string, a: Pt, b: Pt, distance: number): boolean {
  return change(id, (u) => (u.locked ? null : scaleByTwoPoints(u, a, b, distance)));
}

export const setUnderlayOpacity = (id: string, opacity: number): boolean => Number.isFinite(opacity) && change(id, (u) => ({ ...u, opacity: Math.min(1, Math.max(0, opacity)) }));

export const setUnderlayLocked = (id: string, locked: boolean): boolean => change(id, (u) => ({ ...u, locked }));

/** Whether a sheet prints the underlay (it is not printed anywhere until chosen). */
export function setUnderlayPrintsOn(id: string, sheetId: string, prints: boolean): boolean {
  return change(id, (u) => {
    const others = (u.printOnSheets ?? []).filter((s) => s !== sheetId);
    const sheets = prints ? [...others, sheetId] : others;
    const { printOnSheets: _old, ...rest } = u;
    return sheets.length > 0 ? { ...rest, printOnSheets: sheets } : rest;
  });
}

/** The underlay a command works on in a view: the first one that is not locked. */
export const unlockedUnderlayOf = (viewId: string): ViewUnderlay | undefined => all().find((u) => u.viewId === viewId && !u.locked);
