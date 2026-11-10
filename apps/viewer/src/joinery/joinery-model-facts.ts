/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the sheet's "Add a column" offers a door and window schedule besides its own rows (#446): the properties and quantities the schedule's
 * elements and their types carry in the loaded models, in the shape the list schedules' picker takes (`ModelFacts`, one set and name
 * format). Only the schedule's own elements are read, so the picker lists what a cell could show, not every property of the building.
 */

import { CUSTOM_PSET, customPropNames } from '@bimvoice/ifcsheet';
import { discoverModelRows, mergeFound } from '@bimvoice/ifcsheet/project';
import { prepareListProviders } from '@/lib/lists/prepare-providers';
import { useViewerStore } from '@/store';
import type { ModelFacts } from '@/components/viewer/lists/list-schedule-draft';
import type { ScheduleData } from './schedule-data';

/** The sets and names found on the elements of `data` (every occurrence of every type) and on the types they are defined by. */
export function joineryModelFacts(data: ScheduleData): ModelFacts {
  const byModel = new Map<string, number[]>();
  for (const e of data.entries) for (const o of e.occurrences) byModel.set(o.modelId, [...(byModel.get(o.modelId) ?? []), o.expressId]);
  const { pairs } = prepareListProviders(useViewerStore.getState(), {});
  const found = mergeFound(pairs.flatMap((pair) => (byModel.has(pair.modelId) ? [discoverModelRows(pair.provider, byModel.get(pair.modelId)!)] : [])));
  // A property typed in for a type (#448) is offered like the model's, under its own set: no model states it, the type does.
  const typed = customPropNames(data.entries.map((e) => e.spec));
  const properties = typed.length ? new Map([...found.properties, [CUSTOM_PSET, typed]]) : found.properties;
  return { classes: new Map(), storeys: [], properties, quantities: found.quantities, attributes: [] };
}
