/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models as a snapshot: the compare feature's fingerprints
 * (`lib/compare/buildFingerprints.ts`: the same data hash, geometry hash and
 * world box the Compare panel diffs) taken from every model in the viewer, as
 * edited, and written into the compact form a project saves.
 */

import type { EntityFingerprint } from '@ifc-lite/diff';
import { buildEntityFingerprints, type CompareRef } from '@/lib/compare/buildFingerprints';
import { effectiveCompareStore } from '@/lib/compare/effectiveCompareStore';
import { useViewerStore } from '@/store';
import { snapshotOf, type ModelSnapshot } from './snapshot';

/** Null when no model with its data is loaded. */
export async function currentSnapshot(now = Date.now()): Promise<ModelSnapshot | null> {
  const s = useViewerStore.getState();
  const all: EntityFingerprint<CompareRef>[] = [];
  const names = new Map<string, string>();
  for (const model of s.models.values()) {
    const store = model.ifcDataStore;
    if (!store) continue;
    const effective = await effectiveCompareStore(store, s.mutationViews.get(model.id) ?? null, model.schemaVersion);
    const fingerprints = await buildEntityFingerprints({
      modelId: model.id, store: effective, meshes: model.geometryResult?.meshes ?? [],
      instancedGeometryHashes: model.geometryResult?.instancedGeometryHashes, instancedGeometryAabbs: model.geometryResult?.instancedGeometryAabbs,
      idOffset: model.idOffset,
    });
    for (const f of fingerprints) names.set(f.key, effective.entities.getName(f.ref.localId) ?? '');
    all.push(...fingerprints);
  }
  return all.length === 0 ? null : snapshotOf(all, (key) => names.get(key) ?? '', now);
}
