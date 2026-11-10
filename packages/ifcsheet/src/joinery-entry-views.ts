/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a schedule entry's views come from: the first occurrence of its type that has body geometry in a model, read through
 * `ScheduleModel.meshesOf` (flat meshes, else the pieces of a GPU-instanced element, #583), cut by `elementViews`. The web app and
 * the headless build call this one function; what differs is how each reads its models, so the host says it through `EntryViewHooks`.
 * An entry with no body geometry is left out, and its card draws the generated symbol.
 */

import type { ElementViews } from './joinery-element-views.js';
import { elementViews } from './joinery-element-views.js';
import type { ScheduleEntry, ScheduleModel } from './joinery-schedule.js';

export interface EntryViewHooks {
  /** The horizontal point (viewer world x, z) the exterior faces away from: the middle of the model. Null leaves the model out (it has no geometry). */
  awayFrom: (modelId: string) => { x: number; z: number } | null;
  /** A model's memo of views by `expressId:scale`, living as long as the host's stamp of that model's geometry and edits; absent: nothing is kept. */
  cacheOf?: (modelId: string) => Map<string, Promise<ElementViews | null>>;
  /** An entry that no occurrence could give views for: `why` says in words that it has none or that there is no occurrence. */
  fallback?: (entry: ScheduleEntry, why: string) => void;
  /** The cut of an occurrence threw: the next occurrence's views are not tried, the entry falls back. */
  failed?: (entry: ScheduleEntry, message: string) => void;
}

/** The views of every entry that has body geometry, by entry key. */
export async function entryViews(entries: readonly ScheduleEntry[], scale: number, models: readonly ScheduleModel[], hooks: EntryViewHooks): Promise<Map<string, ElementViews>> {
  const byId = new Map(models.map((m) => [m.modelId, m]));
  const out = new Map<string, ElementViews>();
  await Promise.all(entries.map(async (entry) => {
    for (const o of entry.occurrences) {
      const model = byId.get(o.modelId);
      const awayFrom = hooks.awayFrom(o.modelId);
      if (!model || !awayFrom) continue;
      // The model's own mesh read, as the measured sizes and quantities take it: an instanced window's pieces count.
      const meshes = model.meshesOf?.(o.expressId) ?? [];
      if (meshes.length === 0) continue;
      const cache = hooks.cacheOf?.(o.modelId) ?? new Map<string, Promise<ElementViews | null>>();
      const key = `${o.expressId}:${scale}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = elementViews(meshes, { awayFrom, scale }).catch((err: unknown) => {
          hooks.failed?.(entry, err instanceof Error ? err.message : String(err));
          return null;
        });
        cache.set(key, pending);
      }
      const views = await pending;
      if (views) { out.set(entry.key, views); return; }
    }
    hooks.fallback?.(entry, entry.occurrences.length === 0 ? 'no occurrence in the models' : 'no body geometry on its occurrences');
  }));
  return out;
}
