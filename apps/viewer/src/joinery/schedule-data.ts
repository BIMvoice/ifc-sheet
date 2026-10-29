/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a joinery schedule lists, read live from every loaded model: each
 * configured type (one row per catalogue entry, merged across models) with
 * its occurrences counted per level — with the doors / windows the
 * project's symbol mapping assigns to it — and the rest grouped by class and
 * size, each group marked D1, W1… (`markUntyped`). Levels are merged by name and
 * ordered by elevation, top floor last. Every occurrence is numbered within
 * its type, level by level (`occurrenceMark`: W1.3), the numbering a plan
 * tag, the Elements sheet and `schedule-numbering.ts` share.
 */

import { DEFAULT_JOINERY_MAPPING, modelRowsOf, scheduleFilterProperties, type ScheduleContent } from '@bimvoice/ifcsheet';
import { joineryScheduleData, occurrenceMark, type ScheduleData, type ScheduleEntry, type ScheduleKind, type ScheduleModel, type ScheduleOccurrence } from '@bimvoice/ifcsheet/project';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { entityName } from '@/lib/commands/modeling/authored-kinds';
import { catalogue } from './catalog';
import { prepareListProviders } from '@/lib/lists/prepare-providers';

// The row loop is the engine's (`joineryScheduleData`): the headless check and the app list the same rows.
export { occurrenceMark };
export type { ScheduleData, ScheduleEntry, ScheduleKind, ScheduleOccurrence };

/**
 * The rows of the joinery schedule of `kind` over the loaded models, with the open project's catalogue and mapping; sorted and numbered by `content` when given.
 * The rows carry the properties the project's filters name (`scheduleFilterProperties`, as the headless check reads them) and IsExternal, so a sub-report or a
 * schedule can be cut by property value.
 */
export function scheduleData(kind: ScheduleKind, content?: ScheduleContent): ScheduleData {
  const s = useViewerStore.getState();
  const models: ScheduleModel[] = [];
  let prepared: ReturnType<typeof prepareListProviders> | undefined;
  for (const [modelId, model] of s.models) {
    const dataStore = model.ifcDataStore;
    if (!dataStore) continue;
    const view = s.mutationViews.get(modelId) ?? null;
    models.push({ modelId, dataStore, view, nameOf: (id) => entityName({ dataStore, view }, id), listProvider: () => (prepared ??= prepareListProviders(s, {})).pairs.find((pair) => pair.modelId === modelId)!.provider });
  }
  const p = useProjectStore.getState();
  return joineryScheduleData(models, { joineryTypes: catalogue(p), joineryMapping: p.joineryMapping ?? DEFAULT_JOINERY_MAPPING, symbolFlips: p.symbolFlips }, kind, content, scheduleFilterProperties(p.schedules ?? []), modelRowsOf((p.schedules ?? []).map((x) => x.content)));
}

