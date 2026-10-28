/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Drafting on a joinery type's view (#492). The type's front, plan and section are a drafting target like a plan view: the same
 * session, commands, snaps and undo, working on entities of one view id (`view-draft-id.ts`). What the user draws belongs to the TYPE,
 * so it is kept on the type (`JoinerySpec.view.drafts`, in the view's own frame): the entities in the project's drafts are only the
 * working copy of an open drafting view. Entering loads the type's shapes; every change writes them back to the type, so every schedule
 * that shows the type prints them and the project file keeps them (the working copy itself is left out of the file, `serializeProject`).
 *
 * The undo history of the drafts is cleared on entering and on leaving: a step recorded before holds the whole list of drafts, and
 * undoing it inside the view would take the working copy with it and write the empty list back to the type.
 */

import { joineryViewDrafts, withViewDrafts, isJoineryDraftType, type JoineryViewName } from '@bimvoice/ifcsheet/project';
import type { JoineryViewDraft } from '@ifc-lite/create';
import { useProjectStore } from '@/project/project-store';
import { clearDraftHistory, draftsOfView } from '@/drafting/draft-store';
import { readShape } from '@/drafting/draft-file';
import { layerPen } from '@/drafting/styles';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import { joineryEntry, updateJoinery } from './catalog';
import { isJoineryDraftViewId, joineryDraftViewId } from './view-draft-id';

/**
 * The stored drafts of a type's view the drafting reader refuses, by view id. They are not in the working copy, but they are still the
 * type's data: every write-back keeps them, so opening and closing a view never removes a draft.
 */
const kept = new Map<string, JoineryViewDraft[]>();

/** A stored draft as a working-copy entity; one whose shape the drafting reader refuses is null (and is kept as it is, see `kept`). */
function entityOf(viewId: string, d: JoineryViewDraft): DraftEntity | null {
  try {
    return { id: d.id, viewId, layerId: d.layerId ?? '0', shape: readShape(d.shape, `joinery draft ${d.id}`), params: { ...d.params } };
  } catch (err) {
    console.warn(`[joinery] draft ${d.id} of ${viewId} cannot be edited and is kept as stored:`, err);
    return null;
  }
}

/** A working-copy entity as the type keeps it: its shape, its layer and the pen the layer gives it. Only what a schedule prints is kept. */
function storedOf(e: DraftEntity, layers: readonly DraftLayer[]): JoineryViewDraft[] {
  if (!isJoineryDraftType(e.shape.type)) return [];
  const layer = layers.find((l) => l.id === e.layerId);
  const pen = layerPen(layer);
  return [{
    id: e.id, shape: JSON.parse(JSON.stringify(e.shape)) as JoineryViewDraft['shape'], layerId: e.layerId, weight: pen.width,
    ...(pen.dash.length && (layer?.lineType === 'dashed' || layer?.lineType === 'dotted' || layer?.lineType === 'dashdot') ? { lineType: layer.lineType } : {}),
    ...(Object.keys(e.params).length ? { params: { ...e.params } } : {}),
  }];
}

/** Writes the working copy of a view back to its type (nothing is written when the type already holds exactly that). */
export function writeBackJoineryDrafts(typeId: string, view: JoineryViewName): void {
  const spec = joineryEntry(typeId);
  if (!spec) return;
  const { drafts, draftLayers } = useProjectStore.getState();
  const viewId = joineryDraftViewId(typeId, view);
  const stored = [...draftsOfView(viewId, drafts).flatMap((e) => storedOf(e, draftLayers)), ...(kept.get(viewId) ?? [])];
  if (JSON.stringify(stored) === JSON.stringify(joineryViewDrafts(spec, view))) return;
  updateJoinery(withViewDrafts(spec, view, stored));
}

/**
 * Opens a type's view for drafting: its shapes become the working copy, and every change to the drafts is written back to the type.
 * Returns the function that closes it (writes once more, drops the working copy).
 */
export function openJoineryViewDrafts(typeId: string, view: JoineryViewName): () => void {
  const viewId = joineryDraftViewId(typeId, view);
  const spec = joineryEntry(typeId);
  const loaded: DraftEntity[] = [];
  const unreadable: JoineryViewDraft[] = [];
  for (const d of joineryViewDrafts(spec, view)) {
    const entity = entityOf(viewId, d);
    if (entity) loaded.push(entity); else unreadable.push(d);
  }
  kept.set(viewId, unreadable);
  clearDraftHistory();
  useProjectStore.setState((s) => ({ drafts: [...s.drafts.filter((d) => d.viewId !== viewId), ...loaded] }));
  const stop = useProjectStore.subscribe((state, before) => {
    if (state.drafts !== before.drafts || state.draftLayers !== before.draftLayers) writeBackJoineryDrafts(typeId, view);
  });
  return () => {
    stop();
    writeBackJoineryDrafts(typeId, view);
    kept.delete(viewId);
    clearDraftHistory();
    useProjectStore.setState((s) => (s.drafts.some((d) => d.viewId === viewId) ? { drafts: s.drafts.filter((d) => !isJoineryDraftViewId(d.viewId)) } : {}));
  };
}
