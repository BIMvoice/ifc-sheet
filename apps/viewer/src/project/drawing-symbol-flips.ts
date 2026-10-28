/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * Flip a door's swing or hinge side on the DRAWING (#491): a last-minute fix that leaves the model alone. The flips are the project's
 * `symbolFlips` (GlobalId -> bits: 1 hinge side, 2 swing side), which the plan symbols, the sheet, the PDF and the DXF all read, so a
 * flip is kept across save / reopen and a model update and is never written to the IFC. Each call is ONE undo step.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useViewerStore } from '@/store';
import { drawnJoineryOfRenderId } from '@/joinery/mapped-joinery';
import { renderIdGlobalId } from './element-guid';
import { toggleSymbolFlips, useProjectStore } from './project-store';

export const FLIP_HINGE = 1;
export const FLIP_SWING = 2;

/** Whether the renderer id is a door, or a window drawn from a joinery type (an untyped window is symmetric: a flip would show nothing). */
export function isFlippable(renderId: number): boolean {
  const ref = useViewerStore.getState().resolveGlobalIdFromModels(renderId);
  const type = ref ? String(useViewerStore.getState().models.get(ref.modelId)?.ifcDataStore?.entities.getTypeName(ref.expressId) ?? '').toUpperCase() : '';
  if (/^IFCDOOR/.test(type)) return true;
  return /^IFCWINDOW/.test(type) && drawnJoineryOfRenderId(renderId) !== null;
}

/** Toggle one flip (`FLIP_HINGE` or `FLIP_SWING`) on the elements `globalIds` name, as one undo step. */
export function flipOnDrawing(globalIds: readonly string[], bit: typeof FLIP_HINGE | typeof FLIP_SWING): void {
  if (globalIds.length === 0) return;
  runAsOneUndoStep(() => toggleSymbolFlips(globalIds, bit));
}

/** Drop the flips of `globalIds` (all of them when omitted), as one undo step. */
export function resetFlipsOnDrawing(globalIds?: readonly string[]): void {
  const flips = useProjectStore.getState().symbolFlips ?? {};
  const drop = (globalIds ?? Object.keys(flips)).filter((id) => flips[id]);
  if (drop.length === 0) return;
  runAsOneUndoStep(() => {
    const next = { ...useProjectStore.getState().symbolFlips };
    for (const id of drop) delete next[id];
    useProjectStore.setState({ symbolFlips: next, dirty: true });
  });
}

/** The renderer ids' GlobalIds, keeping those that are flippable. */
export function flippableGlobalIds(renderIds: readonly number[]): string[] {
  return renderIds.filter(isFlippable).map(renderIdGlobalId).filter((g): g is string => !!g);
}
