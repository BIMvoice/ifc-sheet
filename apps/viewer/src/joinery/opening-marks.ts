/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The mark a plan tag shows on a door or window (#631): the engine's `elementMark` over the schedule the project prints (`scheduleData`), the
 * same entries and typed marks the schedule's Mark cell is built from, so a tag on the plan is findable in the schedule. The index is kept
 * until one of the stores `scheduleData` reads changes (the inputs the schedule cards memoise on).
 */

import { elementMark, markIndex, markKey, type ScheduleContent } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { scheduleData } from './schedule-data';

type Inputs = readonly unknown[];
let kept: { inputs: Inputs; index: Map<string, string> } | null = null;

/** The schedule choice that changes a type's mark (its numbering); the filter and the sort do not move a mark. */
function numberingOf(): ScheduleContent | undefined {
  const own = (useProjectStore.getState().schedules ?? []).find((s) => !s.sub && s.content?.numbering)?.content?.numbering;
  return own ? { numbering: own } : undefined;
}

function indexNow(): Map<string, string> {
  const v = useViewerStore.getState(), p = useProjectStore.getState();
  const inputs: Inputs = [v.mutationVersion, v.models, p.joineryTypes, p.joineryMapping, p.joineryOverrides, p.schedules];
  if (kept && kept.inputs.length === inputs.length && kept.inputs.every((x, i) => x === inputs[i])) return kept.index;
  const data = scheduleData('all', numberingOf());
  const index = markIndex(data.entries, p.joineryOverrides);
  kept = { inputs, index };
  return index;
}

/** The mark of the door or window `expressId` of `modelId` whose model Tag is `tag`: its typed mark, its Tag, else its type's schedule mark; empty when it has none. */
export function openingMarkOf(modelId: string, expressId: number, tag: string): string {
  const found = indexNow().get(markKey(modelId, expressId));
  return found ?? elementMark({ tag, typeMark: '' });
}
