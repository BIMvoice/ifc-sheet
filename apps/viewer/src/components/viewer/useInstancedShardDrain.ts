/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, type MutableRefObject } from 'react';
import type { Renderer } from '@ifc-lite/renderer';
import { decodeInstancedShard, type DecodedInstance } from '@ifc-lite/geometry';
import { liftNewInstancedOccurrences } from '@/lib/level-arrival';
import { activeLoadTrace } from '@/lib/perf/activeLoadTrace';
import { useViewportCovered } from './viewport-cover';

/**
 * The instanced half of "every express id is global": re-home, in place, the
 * ids each occurrence of a decoded IFNS shard carries onto its owning model's
 * global id space. The flat half, `applyFederationOffsetToMesh` in
 * `hooks/useIfcLoader.ts`, carries the reasoning and the absence rules; the two
 * must move together because `Scene.getInstancedMeshDataPieces` materializes an
 * occurrence into a `MeshData` and stamps `itemId` onto its `geometryItemId`,
 * so a shard left in local space feeds the flat field a local number.
 *
 * Typed to the one field it touches rather than to `DecodedInstancedShard`, so
 * a header field added to the wire format does not become part of this
 * function's contract, or of every fixture that exercises it.
 */
export function applyFederationOffsetToShard(
  shard: { instances: DecodedInstance[] },
  idOffset: number,
): void {
  if (idOffset <= 0) return;
  for (const instance of shard.instances) {
    instance.entityId = instance.entityId + idOffset;
    if (typeof instance.itemId === 'number') {
      instance.itemId = instance.itemId + idOffset;
    }
  }
}

export interface InstancedShardDrainParams {
  rendererRef: MutableRefObject<Renderer | null>;
  isInitialized: boolean;
  pendingInstancedShards: Array<{ modelId: string; bytes: ArrayBuffer }> | null;
  modelIdToIndex?: ReadonlyMap<string, number>;
  modelIdToOffset?: ReadonlyMap<string, number>;
  currentLevelY?: ReadonlyMap<number, number>;
  clearInstancedShards: () => void;
}

/**
 * GPU-instancing shards. The geometry worker collates each batch into an IFNS shard; the loader pushes the raw bytes
 * into pendingInstancedShards, tagged with the owning model's id. Drain here in two halves (#154):
 *
 *   - DATA, always: decode, re-home each occurrence's id onto that model's express-id space and register the
 *     occurrences with the scene (`registerInstancedShard`). Takeoff, type quantities, urban indicators, joinery and
 *     the exports read instanced geometry from there, and IfcSheet keeps the viewport covered for the whole session,
 *     so this half must not wait for the cover. It frees the raw bytes straight away: the scene holds what it needs.
 *   - GPU, when the viewport is not covered: create the buffers of everything registered so far, in arrival order
 *     (`uploadDeferredInstanced`). Nobody can see an instance behind the cover, so the upload waits for it to lift.
 *
 * Each model is registered under its own modelIndex (#1912, a federated model's shards used to be dropped before
 * ever reaching this drain, since the loader only forwarded the primary's).
 */
export function useInstancedShardDrain(params: InstancedShardDrainParams): void {
  const { rendererRef, isInitialized, pendingInstancedShards, modelIdToIndex, modelIdToOffset, currentLevelY, clearInstancedShards } = params;
  const covered = useViewportCovered();
  useEffect(() => {
    if (!isInitialized) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const device = renderer.getGPUDevice();
    const scene = renderer.getScene();
    if (!device) return;
    const trace = activeLoadTrace(); // #6979: shards only arrive while a load streams

    if (pendingInstancedShards !== null) {
      for (const { modelId, bytes } of pendingInstancedShards) {
        // CRITICAL: never let a shard decode/registration throw OUT of this effect: an uncaught throw in a React
        // effect tears down the Viewport subtree via the error boundary, unmounting the <canvas> entirely. Instanced
        // overlays are non-essential, so swallow per-shard failures: the flat geometry still renders.
        try {
          const shard = trace.span('instanced.decode', () => decodeInstancedShard(new Uint8Array(bytes)));
          if (!shard) continue;
          applyFederationOffsetToShard(shard, modelIdToOffset?.get(modelId) ?? 0);
          liftNewInstancedOccurrences(shard, currentLevelY ?? new Map());
          scene.registerInstancedShard(shard, modelIdToIndex?.get(modelId) ?? 0);
        } catch (err) {
          console.warn('[useGeometryStreaming] instanced shard registration failed, skipping:', err);
        }
      }
      clearInstancedShards();
    }

    if (covered || !scene.hasDeferredInstancedUploads()) return;
    try {
      trace.span('instanced.upload', () => scene.uploadDeferredInstanced(device));
    } catch (err) {
      // addInstancedShard creates GPU buffers; on a degraded backend whose device is being lost (e.g. CI's
      // SwiftShader), createBuffer throws. The flat geometry still renders.
      console.warn('[useGeometryStreaming] instanced shard upload failed (device lost?), skipping:', err);
    }
    renderer.requestRender();
  }, [pendingInstancedShards, modelIdToIndex, modelIdToOffset, isInitialized, clearInstancedShards, covered]);
}
