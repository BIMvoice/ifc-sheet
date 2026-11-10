/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a schedule entry's views come from: the first occurrence of its type
 * that has body geometry in a loaded model, read through `ScheduleModel.meshesOf`
 * (flat meshes, else the pieces of a GPU-instanced element). The cut is the engine's
 * (`entryViews`); the app keeps the memo, per model geometry and mutation version (an edit
 * rebuilds), shared by the schedule tab and every sheet that places it. An entry with no body
 * geometry is logged once and left out, so its card draws the generated symbol (`schedule-layout.ts`).
 */

import { entryViews as engineEntryViews, type ElementViews, type ScheduleModel } from '@bimvoice/ifcsheet/project';
import { useViewerStore } from '@/store';
import type { ScheduleData, ScheduleEntry } from './schedule-data';
import { loadedScheduleModels } from './schedule-models';

const warned = new Set<string>();

/** The fallback is explicit: say, once per type, that the card shows the generated symbol and why. */
function warnFallback(entry: ScheduleEntry, why: string): void {
  if (warned.has(entry.key)) return;
  warned.add(entry.key);
  console.warn(`[joinery] ${entry.mark} ${entry.name}: ${why}; its card draws the generated symbol instead of the model's views.`);
}

interface Memo { stamp: string; byKey: Map<string, Promise<ElementViews | null>> }
const memo = new WeakMap<object, Memo>();

/** The views of every entry that has body geometry, by entry key. */
export function entryViews(
  data: ScheduleData,
  scale: number,
  models: readonly ScheduleModel[] = loadedScheduleModels({ hidden: true }),
): Promise<Map<string, ElementViews>> {
  const s = useViewerStore.getState();
  return engineEntryViews(data.entries, scale, models, {
    awayFrom: (modelId) => {
      const b = s.models.get(modelId)?.geometryResult?.coordinateInfo.shiftedBounds;
      return b ? { x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 } : null;
    },
    cacheOf: (modelId) => {
      const geometry = s.models.get(modelId)!.geometryResult!;
      const stamp = `${s.mutationVersion}`;
      let m = memo.get(geometry);
      if (!m || m.stamp !== stamp) { m = { stamp, byKey: new Map() }; memo.set(geometry, m); }
      return m.byKey;
    },
    fallback: warnFallback,
    failed: (entry, message) => console.warn(`[joinery] ${entry.mark} ${entry.name}: the views failed (${message})`),
  });
}
