/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drawing the plan symbol of a door or window type in the drafting view (#448). The symbol is a block (`JoinerySpec.planBlock`, the same
 * strokes a DXF import keeps), and what the user draws is only a working copy of it: entities on the symbol's own view id
 * (`joinerySymbolViewId`), opened from the block the type holds and read back into a block when the user saves. Nothing is written to the
 * type while drawing, so closing the editor without saving changes nothing; the working copy itself is never saved with the project
 * (`withoutJoineryDraftViews`). The drafting session, tools, snaps and undo are the plan views' own.
 *
 * The editor has an undo history of its own: the one the user's drawing had is set aside on opening (`parkDraftHistory`) and put back,
 * step for step, on closing, so the symbol's edits are never in it and undoing in the editor cannot reach the user's steps.
 */

import { blockAsShapes, blockFromDrafts } from '@bimvoice/ifcsheet/project';
import type { JoineryBlockSymbol } from '@ifc-lite/create';
import { useProjectStore } from '@/project/project-store';
import { addLayer, updateLayer } from '@/project/drafting-standards';
import { draftsOfView, newDraft, parkDraftHistory } from '@/drafting/draft-store';
import type { DraftEntity } from '@/drafting/types';
import { storedOf } from './view-drafts';
import { joinerySymbolViewId } from './view-draft-id';

/** The layer dashed strokes of a block are drawn on: a dashed layer the project has, else one made for them. */
function dashedLayerId(): string {
  const found = useProjectStore.getState().draftLayers.find((l) => l.lineType === 'dashed');
  if (found) return found.id;
  const id = addLayer('Dashed');
  updateLayer(id, { lineType: 'dashed', lineWeight: 0.18 });
  return id;
}

/** The layer continuous strokes go on: the first the project has that is not dashed or dotted. */
function plainLayerId(): string {
  const layers = useProjectStore.getState().draftLayers;
  return (layers.find((l) => l.lineType === undefined) ?? layers[0])?.id ?? '0';
}

/**
 * Opens the working copy of `typeId`'s plan symbol from `block` (null: an empty canvas). Returns the function that closes it. Every
 * stroke of the block is one polyline; a dashed stroke is on a dashed layer, so it is kept dashed when saved.
 */
export function openSymbolDrafts(typeId: string, block: JoineryBlockSymbol | null): () => void {
  const viewId = joinerySymbolViewId(typeId);
  const shapes = block ? blockAsShapes(block) : [];
  const plain = plainLayerId();
  const dashed = shapes.some((s) => s.dashed) ? dashedLayerId() : plain;
  const loaded: DraftEntity[] = shapes.map((s) => newDraft(viewId, s.dashed ? dashed : plain, s.shape as DraftEntity['shape']));
  const restoreHistory = parkDraftHistory();
  useProjectStore.setState((s) => ({ drafts: [...s.drafts.filter((d) => d.viewId !== viewId), ...loaded] }));
  return () => {
    useProjectStore.setState((s) => (s.drafts.some((d) => d.viewId === viewId) ? { drafts: s.drafts.filter((d) => d.viewId !== viewId) } : {}));
    restoreHistory();
  };
}

/** The block the open working copy makes (null: nothing is drawn). Lines, polylines, circles and arcs count; a dashed layer's strokes are dashed. */
export function drawnSymbolOf(typeId: string): JoineryBlockSymbol | null {
  const { drafts, draftLayers } = useProjectStore.getState();
  return blockFromDrafts(draftsOfView(joinerySymbolViewId(typeId), drafts).flatMap((e) => storedOf(e, draftLayers)));
}
