/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which revision the revision cloud tool draws for. The choice is the person's
 * for the session and is not saved; without one (or when it names a revision
 * that is gone) the latest record is used.
 */

import { create } from 'zustand';
import { useProjectStore } from './project-store';
import { latestRevisionId } from './revisions';

export const useRevisionTool = create<{ revisionId: string | null }>()(() => ({ revisionId: null }));

export function chooseCloudRevision(revisionId: string | null): void {
  useRevisionTool.setState({ revisionId });
}

/** The revision the next cloud belongs to: the chosen one if it still exists, else the latest; null when the project has none. */
export function cloudRevisionNow(): string | null {
  const project = useProjectStore.getState();
  const chosen = useRevisionTool.getState().revisionId;
  return chosen && (project.revisions ?? []).some((r) => r.id === chosen) ? chosen : latestRevisionId(project);
}
