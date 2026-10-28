/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the review by element does to the project (#186, section 2): merge or move a type to a part, keep elements apart on purpose,
 * check them again. The edits are the engine's (`placeTypesOf`, `keepApart`, `resumeChecking`); these write them, every one as a
 * single undo step, so Undo takes back the whole change however many parts it touched. Moving a type changes only the parts' filters:
 * the schedule's numbering applies before the cut, so no mark changes and no plan tag has to follow.
 */

import { keepApart, placeTypesOf, resumeChecking } from '@bimvoice/ifcsheet';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useProjectStore } from '@/project/project-store';
import { scheduleData } from './schedule-data';
import { scheduleById, setSubReportFilter, updateSchedule } from './schedules';

/** List the types `keys` in the part `toPartId` of the schedule `parentId`, and in no other part. Returns how many parts were changed. */
export function placeTypes(parentId: string, keys: readonly string[], toPartId: string): number {
  const parent = scheduleById(parentId);
  if (!parent) return 0;
  const edits = placeTypesOf(parent, useProjectStore.getState().schedules ?? [], scheduleData, keys, toPartId);
  if (edits.length === 0) return 0;
  runAsOneUndoStep(() => {
    for (const { partId, filter } of edits) setSubReportFilter(partId, { kinds: filter.kinds, levels: filter.levels, types: filter.types });
  });
  return edits.length;
}

/** The check leaves these ids alone from now on (`keepId`s: an element, or a whole type with its key alone). */
export function keepApartIds(parentId: string, ids: readonly string[]): void {
  const parent = scheduleById(parentId);
  if (!parent) return;
  runAsOneUndoStep(() => updateSchedule(parentId, { keptApart: keepApart(parent.keptApart, ids) }));
}

/** The check flags these ids again if more than one part lists them. */
export function resumeIds(parentId: string, ids: readonly string[]): void {
  const parent = scheduleById(parentId);
  if (!parent) return;
  runAsOneUndoStep(() => updateSchedule(parentId, { keptApart: resumeChecking(parent.keptApart, ids) }));
}
