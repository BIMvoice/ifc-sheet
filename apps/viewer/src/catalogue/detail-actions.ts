/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The detail library as project actions: save a drafting view as a library
 * entry, place an entry as a new drafting view. Entries reach other projects
 * through the `.bvlib` file (the `details` kind).
 */

import { commitDrafts, runAsOneUndoStep } from '@/drafting/draft-store';
import { draftingViewOf } from '@/drafting/drafting-view';
import { addProjectView, useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { nameKey, type ClashPolicy } from './catalogue-merge';
import { applyCatalogue } from './catalogue-store';
import { detailEntryOf, placeDetailEntry } from './detail-library';

/**
 * Save drafting view `viewId` to the library as `name` (default: the view's
 * name). An entry of the same name is replaced. Returns the entry's id, or
 * `null` when the view is not a drafting view.
 */
export function saveViewAsLibraryDetail(viewId: string, name?: string): string | null {
  const s = useProjectStore.getState();
  const entry = detailEntryOf(s, viewId, freshProjectId('detail'), name);
  if (!entry) return null;
  const others = (s.details ?? []).filter((d) => nameKey(d.name) !== nameKey(entry.name));
  useProjectStore.setState({ details: [...others, entry], dirty: true });
  return entry.id;
}

export function removeLibraryDetail(id: string): void {
  useProjectStore.setState({ details: (useProjectStore.getState().details ?? []).filter((d) => d.id !== id), dirty: true });
}

/**
 * Place library entry `entryId` as a new drafting view. Its layers, symbols
 * and hatch patterns are merged into the project under `policy`; the drafts
 * get fresh ids. One undo step. Returns the new view's id, or `null` when
 * there is no such entry.
 */
export function placeLibraryDetail(entryId: string, policy: ClashPolicy = 'mine'): string | null {
  const s = useProjectStore.getState();
  const entry = (s.details ?? []).find((d) => d.id === entryId);
  if (!entry) return null;
  let viewId: string | null = null;
  runAsOneUndoStep(() => {
    viewId = addProjectView({ ...draftingViewOf(entry.name, entry.scale), id: freshProjectId('view') });
    const placed = placeDetailEntry(s, entry, viewId, policy, freshProjectId);
    applyCatalogue({ ...placed.merged, details: useProjectStore.getState().details ?? [] });
    commitDrafts([...useProjectStore.getState().drafts, ...placed.drafts]);
  });
  return viewId;
}
