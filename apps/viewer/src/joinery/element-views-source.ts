/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a schedule entry's views come from: the first occurrence of its type
 * that has body geometry in a loaded model, read through `ScheduleModel.meshesOf`
 * (flat meshes, else the pieces of a GPU-instanced element). Cached per model geometry and
 * mutation version (an edit rebuilds), shared by the schedule tab and every
 * sheet that places it. An entry with no body geometry is logged once and
 * left out, so its card draws the generated symbol (`schedule-layout.ts`).
 */

import type { ScheduleModel } from '@bimvoice/ifcsheet/project';
import { useViewerStore } from '@/store';
import type { ScheduleData, ScheduleEntry } from './schedule-data';
import { elementViews, type ElementViews } from './element-views';
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
export async function entryViews(
  data: ScheduleData,
  scale: number,
  models: readonly ScheduleModel[] = loadedScheduleModels({ hidden: true }),
): Promise<Map<string, ElementViews>> {
  const s = useViewerStore.getState();
  const byId = new Map(models.map((m) => [m.modelId, m]));
  const out = new Map<string, ElementViews>();
  await Promise.all(data.entries.map(async (entry) => {
    for (const o of entry.occurrences) {
      const model = s.models.get(o.modelId);
      const geometry = model?.geometryResult;
      if (!model || !geometry) continue;
      // The model's own mesh read, as the measured sizes and quantities take it: an instanced window's pieces count.
      const meshes = byId.get(o.modelId)?.meshesOf?.(o.expressId) ?? [];
      if (meshes.length === 0) continue;
      const stamp = `${s.mutationVersion}`;
      let m = memo.get(geometry);
      if (!m || m.stamp !== stamp) { m = { stamp, byKey: new Map() }; memo.set(geometry, m); }
      const key = `${o.expressId}:${scale}`;
      let pending = m.byKey.get(key);
      if (!pending) {
        const b = geometry.coordinateInfo.shiftedBounds;
        const awayFrom = { x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 };
        pending = elementViews(meshes, { awayFrom, scale }).catch((err: unknown) => {
          console.warn(`[joinery] ${entry.mark} ${entry.name}: the views failed (${err instanceof Error ? err.message : String(err)})`);
          return null;
        });
        m.byKey.set(key, pending);
      }
      const views = await pending;
      if (views) { out.set(entry.key, views); return; }
    }
    warnFallback(entry, entry.occurrences.length === 0 ? 'no occurrence in the models' : 'no body geometry on its occurrences');
  }));
  return out;
}
