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
import { nameKey, uniqueName, type ClashPolicy } from './catalogue-merge';
import { applyCatalogue } from './catalogue-store';
import { detailEntryOf, placeDetailEntry } from './detail-library';
import type { LibraryDetail } from './types';

/** What a save does to an entry of the same name: replace it, or keep both, the new one renamed "Name (2)". */
export type SameNameChoice = 'replace' | 'both';

/** The library entry that saving drafting view `viewId` as `name` (default: the view's name) would meet by name, if any: what the person is asked about first. */
export function libraryDetailNamed(viewId: string, name?: string): LibraryDetail | null {
  const s = useProjectStore.getState();
  const view = s.views.find((v) => v.id === viewId);
  if (!view) return null;
  const key = nameKey(name?.trim() || view.name);
  return (s.details ?? []).find((d) => nameKey(d.name) === key) ?? null;
}

/**
 * Save drafting view `viewId` to the library as `name` (default: the view's
 * name). An entry of the same name is kept and the new one renamed "Name (2)"
 * unless `sameName` is `replace`. Returns the entry's id, or `null` when the
 * view is not a drafting view.
 */
export function saveViewAsLibraryDetail(viewId: string, name?: string, sameName: SameNameChoice = 'both'): string | null {
  const s = useProjectStore.getState();
  const made = detailEntryOf(s, viewId, freshProjectId('detail'), name);
  if (!made) return null;
  const details = s.details ?? [];
  const entry = sameName === 'both' ? { ...made, name: uniqueName(made.name, new Set(details.map((d) => nameKey(d.name)))) } : made;
  const others = sameName === 'replace' ? details.filter((d) => nameKey(d.name) !== nameKey(entry.name)) : details;
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
