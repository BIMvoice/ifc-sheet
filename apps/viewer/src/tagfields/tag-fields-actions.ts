/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Setting the sources of a tag field in the project. Labels and element tags
 * re-read their elements when the configuration changes (`labels/label-sync.ts`,
 * `project/useElementTagSync.ts`), so every tag follows without an undo step.
 */

import { useProjectStore } from '@/project/project-store';
import { withSources, type TagFieldId, type TagKind, type TagSource } from './tag-fields';

/** Set the sources `field` of `kind` reads; the default list removes the entry. */
export function setFieldSources(kind: TagKind, field: TagFieldId, sources: readonly TagSource[]): void {
  const current = useProjectStore.getState().tagFields;
  const next = withSources(current, kind, field, sources);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  useProjectStore.setState({ tagFields: next, dirty: true });
}

/** The list with the item at `from` moved to `to`. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
