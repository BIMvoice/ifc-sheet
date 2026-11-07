/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Changing the project's DXF underlays (#547): the DXF linework under a plan view. The panel and the DXFALIGN command go through
 * here, so a locked one is refused in one place. The data and geometry are the engine's (`@bimvoice/ifcsheet/underlay`).
 */

import { importDxf } from '@ifc-lite/drawing-2d';
import { alignDxfByTwoPoints, dxfUnderlayFromPaths, withDxfLayerVisible, type ViewDxfUnderlay } from '@bimvoice/ifcsheet/underlay';
import type { Pt } from '@/drafting/types';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';

const all = (): readonly ViewDxfUnderlay[] => useProjectStore.getState().dxfUnderlays ?? [];

function commit(next: ViewDxfUnderlay[]): void {
  useProjectStore.setState({ dxfUnderlays: next.length > 0 ? next : undefined, dirty: true });
}

export function changeDxfUnderlay(id: string, edit: (u: ViewDxfUnderlay) => ViewDxfUnderlay | null): boolean {
  const current = all();
  const found = current.find((u) => u.id === id);
  const next = found ? edit(found) : null;
  if (!found || !next) return false;
  commit(current.map((u) => (u.id === id ? next : u)));
  return true;
}

export class DxfUnderlayError extends Error {
  constructor(readonly code: 'empty' | 'too-large', message: string) {
    super(message);
    this.name = 'DxfUnderlayError';
  }
}

/** Lays the DXF's text under a plan view, at its own origin, in the layers it came with. Returns its id; throws `DxfUnderlayError` for a file with no line or too many points. */
export function addDxfUnderlayFromText(text: string, name: string, viewId: string): string {
  const made = dxfUnderlayFromPaths(importDxf(text, name), viewId, freshProjectId('dxf-underlay'));
  if (!made) throw new DxfUnderlayError('empty', `${name} has no lines to lay under the view, or more than the project can keep.`);
  commit([...all(), made]);
  return made.id;
}

export function removeDxfUnderlay(id: string): boolean {
  const current = all();
  if (!current.some((u) => u.id === id)) return false;
  commit(current.filter((u) => u.id !== id));
  return true;
}

export const setDxfLayerVisible = (id: string, layer: string, visible: boolean): boolean => changeDxfUnderlay(id, (u) => withDxfLayerVisible(u, layer, visible));

/** Two points where the DXF shows now and where they belong; refused when it is locked or the points do not make a line. */
export const alignDxfUnderlay = (id: string, from: readonly [Pt, Pt], to: readonly [Pt, Pt]): boolean => changeDxfUnderlay(id, (u) => (u.locked ? null : alignDxfByTwoPoints(u, from, to)));

export const setDxfOpacity = (id: string, opacity: number): boolean => Number.isFinite(opacity) && changeDxfUnderlay(id, (u) => ({ ...u, opacity: Math.min(1, Math.max(0, opacity)) }));

export const setDxfLocked = (id: string, locked: boolean): boolean => changeDxfUnderlay(id, (u) => ({ ...u, locked }));

/** Whether a sheet prints the DXF (it is not printed anywhere until chosen). */
export function setDxfPrintsOn(id: string, sheetId: string, prints: boolean): boolean {
  return changeDxfUnderlay(id, (u) => {
    const others = (u.printOnSheets ?? []).filter((s) => s !== sheetId);
    const sheets = prints ? [...others, sheetId] : others;
    const { printOnSheets: _old, ...rest } = u;
    return sheets.length > 0 ? { ...rest, printOnSheets: sheets } : rest;
  });
}

/** The DXF a command works on in a view: the first one that is not locked. */
export const unlockedDxfOf = (viewId: string): ViewDxfUnderlay | undefined => all().find((u) => u.viewId === viewId && !u.locked);
