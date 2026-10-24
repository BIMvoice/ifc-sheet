/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Write the schedule's numbers into the model: each door's and window's
 * Tag becomes its mark within its type (`W1.3`), level by level — what the
 * schedule and the Elements sheet print, so a plan tag, a site list and the
 * IFC say the same. One undo step per model; elements already tagged so are
 * left alone. The marks are the schedule's as numbered by its content choice
 * (`schedule-split.ts`), so the Tag is written from the same source the
 * table is printed from. `writeTags` is also how a change of numbering
 * reaches the plan tags (`schedule-content-actions.ts`).
 */

import type { TagWrite } from '@bimvoice/ifcsheet';
import { useViewerStore } from '@/store';
import { mutationDenial } from '@/store/mutation-permission';
import { occurrenceMark, type ScheduleData } from './schedule-data';

/** IfcElement.Tag: GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, Tag. */
const TAG = 7;

/**
 * Set the Tag of each element in `writes`, one undo step per model. A Tag is an attribute, an edit the documentation edition allows
 * in Edit mode (`setPositionalAttributesBatch`); a model that cannot be edited is reported, with the reason, not skipped.
 */
export function writeTags(writes: readonly TagWrite[]): { written: number; errors: string[] } {
  const byModel = new Map<string, { entityId: number; index: number; value: string }[]>();
  for (const w of writes) byModel.set(w.modelId, [...(byModel.get(w.modelId) ?? []), { entityId: w.expressId, index: TAG, value: w.tag }]);
  let written = 0;
  const errors = new Set<string>();
  for (const [modelId, updates] of byModel) {
    const state = useViewerStore.getState();
    const denial = mutationDenial(state, modelId);
    try {
      if (denial) errors.add(denial);
      else if (state.setPositionalAttributesBatch(modelId, updates) === null) errors.add(`Model ${modelId} cannot be edited`);
      else written += updates.length;
    } catch (err) {
      errors.add(err instanceof Error ? err.message : String(err));
    }
  }
  return { written, errors: [...errors] };
}

export function writeOccurrenceNumbers(data: ScheduleData): { written: number; errors: string[] } {
  const writes: TagWrite[] = [];
  for (const e of data.entries) {
    for (const o of e.occurrences) {
      const tag = occurrenceMark(e, o);
      if (o.tag !== tag) writes.push({ modelId: o.modelId, expressId: o.expressId, tag });
    }
  }
  return writeTags(writes);
}
