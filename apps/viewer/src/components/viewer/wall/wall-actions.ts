/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Wall's controls change on a view: a plan's cut height and a
 * section's or elevation's view depth, stepped by the wheel; and the few large
 * tools it offers for adding information to a drawing.
 */

import { activateDocumentTab } from '@/project/open-view';
import { updateProjectView, useProjectStore } from '@/project/project-store';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import type { TranslationKey } from '@/i18n';

/** Cut heights the Wall offers, metres above the floor, and its step. */
export const CUT_HEIGHT_RANGE = { min: 0.3, max: 2.8, step: 0.05 } as const;
/** View depths the Wall offers, metres beyond the cut, and the depth an automatic one starts from. */
export const DEPTH_RANGE = { min: 0.5, max: 60, step: 0.5, start: 5 } as const;

const clampStep = (v: number, r: { min: number; max: number; step: number }): number =>
  Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step));

/** A plan's cut height moved by `steps` (one wheel notch is one step, up is positive). */
export function nudgeCutHeight(viewId: string, steps: number): void {
  const view = useProjectStore.getState().views.find((v) => v.id === viewId);
  if (view?.kind !== 'plan') return;
  const next = Number(clampStep(view.cutHeight + steps * CUT_HEIGHT_RANGE.step, CUT_HEIGHT_RANGE).toFixed(2));
  if (next !== view.cutHeight) updateProjectView(viewId, { cutHeight: next });
}

export function setCutHeight(viewId: string, metres: number): void {
  const view = useProjectStore.getState().views.find((v) => v.id === viewId);
  if (view?.kind !== 'plan') return;
  const next = Number(clampStep(metres, CUT_HEIGHT_RANGE).toFixed(2));
  if (next !== view.cutHeight) updateProjectView(viewId, { cutHeight: next });
}

/** A section's or elevation's view depth moved by `steps`; an automatic depth starts from a fixed one. */
export function nudgeViewDepth(viewId: string, steps: number): void {
  const view = useProjectStore.getState().views.find((v) => v.id === viewId);
  if (view?.kind !== 'section' && view?.kind !== 'elevation') return;
  const current = view.viewDepth ?? DEPTH_RANGE.start;
  updateProjectView(viewId, { viewDepth: Number(clampStep(current + steps * DEPTH_RANGE.step, DEPTH_RANGE).toFixed(2)) });
}

export interface WallTool {
  command: string;
  labelKey: TranslationKey;
}

/** The only tools a sheet offers: dimension, tag, text note, level mark, section mark, symbol. */
export const WALL_TOOLS: readonly WallTool[] = [
  { command: 'dimaligned', labelKey: 'wall.tool.dimension' },
  { command: 'tag', labelKey: 'wall.tool.tag' },
  { command: 'text', labelKey: 'wall.tool.text' },
  { command: 'level', labelKey: 'wall.tool.level' },
  { command: 'sectionline', labelKey: 'wall.tool.section' },
  { command: 'symbol', labelKey: 'wall.tool.symbol' },
];

/**
 * Open `viewId` to draw on and start `command` there once its drafting view
 * is attached (it mounts after the tab comes forward).
 */
export function drawOnView(viewId: string, command: string): void {
  if (activateDocumentTab(viewId) !== 'opened') return;
  if (useDraftingSession.getState().viewId === viewId) {
    startDraftCommand(command);
    return;
  }
  const unsubscribe = useDraftingSession.subscribe((s) => {
    if (s.viewId !== viewId) return;
    unsubscribe();
    startDraftCommand(command);
  });
  // A view that never attaches (no drawing to draft on) must not leave the listener behind.
  setTimeout(unsubscribe, 10_000);
}
