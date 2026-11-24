/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Starting a drafting command on the drawing the person is looking at, from outside it (the Standards dialog's
 * annotation types, #842). The session stays pointed at the last view drafted on after its tab goes, so a command must
 * not start on it unless a drawing is really in front: a drawing tab, or a drawing on a stepped-in sheet. A sheet on the
 * Wall is no document tab (in IfcSheet the Wall is the face and the 3D tab stays the active one), so the sheet registers
 * how it starts a command on its drawing in front, or on the one chosen on it (opened first).
 */

import { isDrawingTabActive, useDocumentTabs } from '@/project/document-tabs';
import { useProjectStore } from '@/project/project-store';
import { startDraftCommand } from './session';

/** Starts `command` on a drawing of the sheet stepped into; false when the sheet has no drawing in front or chosen. */
export type SheetDrawingStart = (command: string) => boolean;

let sheetStart: SheetDrawingStart | null = null;

/** The stepped-in sheet's own start; returns what to call on unmount. */
export function registerSheetDrawingStart(start: SheetDrawingStart): () => void {
  sheetStart = start;
  return () => { if (sheetStart === start) sheetStart = null; };
}

/**
 * Start `command` on the drawing in front: a plan, section or elevation tab, else a drawing on the sheet stepped into,
 * else a sheet tab's paper. False when nothing is in front to draw on (the 3D model), and nothing starts.
 */
export function startOnDrawingInFront(command: string): boolean {
  const { activeId } = useDocumentTabs.getState();
  const viewTab = useProjectStore.getState().views.some((v) => v.id === activeId && v.kind !== '3d');
  if (!viewTab && sheetStart) return sheetStart(command);
  return isDrawingTabActive() && startDraftCommand(command);
}
