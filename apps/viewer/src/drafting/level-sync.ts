/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keeping the cached number of parametric level marks current when what they
 * read from changes outside drafting (a level's elevation edited, the section
 * plane moved). The number is derived data, so this is not an undo step.
 */

import { useProjectStore } from '@/project/project-store';
import { settleLevel, type LevelResolver } from './level-mark';
import type { DraftEntity } from './types';

/**
 * `drafts` with the cached number of every reference-bearing level mark (of
 * `viewId` when given) brought in line; the same array when none changed.
 */
export function settleLevelDrafts(drafts: DraftEntity[], resolve: LevelResolver, viewId?: string): DraftEntity[] {
  let changed = false;
  const next = drafts.map((d) => {
    if ((viewId !== undefined && d.viewId !== viewId) || d.shape.type !== 'level' || !d.shape.ref) return d;
    const shape = settleLevel(d.shape, resolve);
    if (shape === d.shape) return d;
    changed = true;
    return { ...d, shape };
  });
  return changed ? next : drafts;
}

/** Re-derive the level marks of `viewId`; the drafts array is replaced only when a number changed. */
export function syncLevelMarks(viewId: string, resolve: LevelResolver): void {
  const { drafts } = useProjectStore.getState();
  const next = settleLevelDrafts(drafts, resolve, viewId);
  if (next !== drafts) useProjectStore.setState({ drafts: next });
}
