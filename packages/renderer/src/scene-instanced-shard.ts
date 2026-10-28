/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The two halves of adding an instancing shard to the scene (#154).
 *
 *   - `registerInstancedShard` is the CPU half: the template geometry, the packed occurrence records, the
 *     express-id -> occurrence map and the cached world boxes. It needs no GPU device, and everything that reads
 *     instanced geometry from the scene (takeoff, quantities, urban indicators, exports, picking bounds) reads
 *     exactly this.
 *   - `uploadInstancedTemplates` is the GPU half: the vertex/index/instance buffers of the templates registered
 *     earlier. It can run later, for instance when a viewport that was covered is shown again.
 *
 * Between the two a template's slot in the scene's GPU array is a hole, the same shape a freed slot has, so every
 * GPU-side reader already skips it.
 */

import type { DecodedInstancedShard } from '@ifc-lite/geometry';
import { createStaticGpuBuffer } from './gpu-static-upload.js';
import { createInstancedRteDeltaStream } from './instanced-rte.js';
import {
  prepareInstancedRender,
  foldOccurrenceWorldBox,
  INSTANCE_STRIDE_BYTES,
  INSTANCE_COLOR_OFFSET,
  INSTANCE_FLAGS_OFFSET,
  INSTANCE_FINISH_FLAGS_MASK,
  type InstancedCullMeta,
} from './instanced-render.js';
import { unionInstancedWorldAabb } from './scene-instance-bounds.js';
import type { InstancedTemplateGPU, InstancedOccurrence, InstancedTemplateCpu } from './scene-instance-types.js';
import type { BoundingBox } from './scene-raycaster.js';
import type { ModelTranslations } from './model-translation.js';

/** What the registration half writes into; the scene passes its own stores. */
export interface InstancedShardStores {
  templates: (InstancedTemplateGPU | undefined)[];
  cpu: (InstancedTemplateCpu | undefined)[];
  occurrences: Map<number, InstancedOccurrence[]>;
  boundingBoxes: Map<number, BoundingBox>;
  modelTranslations: ModelTranslations;
}

/** A template that is registered (CPU side complete) and not yet uploaded. */
export interface DeferredInstancedTemplate {
  templateIndex: number;
  modelIndex: number;
  prepared: ReturnType<typeof prepareInstancedRender>[number];
  cull: InstancedCullMeta;
}

export function registerInstancedShard(
  stores: InstancedShardStores,
  shard: DecodedInstancedShard,
  modelIndex: number,
): DeferredInstancedTemplate[] {
  const out: DeferredInstancedTemplate[] = [];
  for (const t of prepareInstancedRender(shard)) {
    if (Math.floor(t.positions.length / 3) === 0 || t.indices.length === 0 || t.instanceCount === 0) continue;
    stores.modelTranslations.placeInstances(
      t.instanceBuffer, modelIndex, INSTANCE_STRIDE_BYTES, t.canonicalAnchors, t.canonicalMatrixTranslations,
    );
    // Always append: slots are stable identities, never recycled. The GPU slot stays a hole until the upload.
    const templateIndex = stores.templates.length;
    stores.templates[templateIndex] = undefined;
    const cull: InstancedCullMeta = { bounds: null, maxOccRadius: 0 };

    // Template-local AABB (used to derive per-occurrence world AABBs cheaply).
    let lmnx = Infinity, lmny = Infinity, lmnz = Infinity;
    let lmxx = -Infinity, lmxy = -Infinity, lmxz = -Infinity;
    for (let i = 0; i < t.positions.length; i += 3) {
      const x = t.positions[i], y = t.positions[i + 1], z = t.positions[i + 2];
      if (x < lmnx) lmnx = x; if (y < lmny) lmny = y; if (z < lmnz) lmnz = z;
      if (x > lmxx) lmxx = x; if (y > lmxy) lmxy = y; if (z > lmxz) lmxz = z;
    }
    // Retain the compact CPU geometry + the packed instance records (mat4 per occurrence) so CPU consumers can reach
    // instanced geometry without a full per-occurrence MeshData each. These are references into the decoded shard.
    // Slot-assigned because release empties the CPU array while GPU slots live on; push would misalign them.
    stores.cpu[templateIndex] = {
      modelIndex,
      positions: t.positions,
      normals: t.normals,
      indices: t.indices,
      instanceData: t.instanceBuffer,
      canonicalAnchors: t.canonicalAnchors,
      canonicalMatrixTranslations: t.canonicalMatrixTranslations,
      localMin: [lmnx, lmny, lmnz],
      localMax: [lmxx, lmxy, lmxz],
    };

    // Map each occurrence's express_id -> (template, byte offset, original colour) so selection (flag byte) +
    // lens/IDS overlays (colour bytes) can patch individual occurrences via writeBuffer without a re-upload. Also
    // fold each occurrence's world AABB (template local box x its mat4) into boundingBoxes so getEntityBoundingBox +
    // the CPU raycast-bounds path (BCF anchors, large/released-model picking, frame-selection) see instanced
    // geometry. (Templates with no finite local box - empty geometry - are skipped.)
    const cdv = new DataView(t.instanceBuffer);
    const haveBox = Number.isFinite(lmnx);
    for (let i = 0; i < t.instanceCount; i++) {
      const byteOffset = i * INSTANCE_STRIDE_BYTES;
      const eid = t.entityIds[i];
      const originalColor: [number, number, number, number] = [
        cdv.getFloat32(byteOffset + INSTANCE_COLOR_OFFSET, true),
        cdv.getFloat32(byteOffset + INSTANCE_COLOR_OFFSET + 4, true),
        cdv.getFloat32(byteOffset + INSTANCE_COLOR_OFFSET + 8, true),
        cdv.getFloat32(byteOffset + INSTANCE_COLOR_OFFSET + 12, true),
      ];
      let arr = stores.occurrences.get(eid);
      if (!arr) {
        arr = [];
        stores.occurrences.set(eid, arr);
      }
      // #2985; no id column or the 0 sentinel => none. ASSIGNED, never conditionally spread: ONE object shape for records that outlive the shard.
      arr.push({ templateIndex, byteOffset, originalColor, itemId: t.itemIds?.[i] || undefined, finishBits: (cdv.getUint32(byteOffset + INSTANCE_FLAGS_OFFSET, true) & INSTANCE_FINISH_FLAGS_MASK) >>> 0 });
      if (haveBox) {
        const w = unionInstancedWorldAabb(stores.boundingBoxes, eid, cdv, byteOffset, t.canonicalAnchors, lmnx, lmny, lmnz, lmxx, lmxy, lmxz);
        // Fold the occurrence's world box into the template's cull metadata (union bounds + largest occurrence
        // bounding-sphere radius) for the per-frame instanced frustum/contribution culls. Non-finite boxes poison
        // the template so it fails OPEN (never culled).
        foldOccurrenceWorldBox(cull, w);
      }
    }
    out.push({ templateIndex, modelIndex, prepared: t, cull });
  }
  return out;
}

export interface UploadedInstancedTemplates {
  /** Ids with an occurrence in these templates that are selected now: their flag byte still has to be written. */
  lateSelected: Set<number>;
  /** Ids with an occurrence here that carry a colour override now: their colour bytes still have to be written. */
  lateOverridden: Set<number>;
}

/** Create the GPU buffers of `deferred` and fill their slots. Selection and override state is read NOW, not at registration. */
export function uploadInstancedTemplates(
  device: GPUDevice,
  templates: (InstancedTemplateGPU | undefined)[],
  deferred: readonly DeferredInstancedTemplate[],
  selected: ReadonlySet<number>,
  overrideColors: ReadonlyMap<number, unknown> | null,
): UploadedInstancedTemplates {
  const lateSelected = new Set<number>();
  const lateOverridden = new Set<number>();
  for (const { templateIndex, modelIndex, prepared: t, cull } of deferred) {
    const vcount = Math.floor(t.positions.length / 3);
    // Interleave the template's local positions + normals into the 28-byte (pos3f + norm3f + entityId u32) vertex
    // layout the instanced pipeline's slot 0 expects. entityId is a 0 placeholder (vs_instanced ignores it).
    const vtx = new ArrayBuffer(vcount * 28);
    const vf = new Float32Array(vtx);
    for (let i = 0; i < vcount; i++) {
      const o = i * 7;
      vf[o + 0] = t.positions[i * 3 + 0];
      vf[o + 1] = t.positions[i * 3 + 1];
      vf[o + 2] = t.positions[i * 3 + 2];
      // normals may be shorter/absent on degenerate meshes - default to 0.
      vf[o + 3] = i * 3 + 0 < t.normals.length ? t.normals[i * 3 + 0] : 0;
      vf[o + 4] = i * 3 + 1 < t.normals.length ? t.normals[i * 3 + 1] : 0;
      vf[o + 5] = i * 3 + 2 < t.normals.length ? t.normals[i * 3 + 2] : 0;
    }
    const vertexBuffer = createStaticGpuBuffer(device, vtx, GPUBufferUsage.VERTEX);
    const indexBuffer = createStaticGpuBuffer(device, t.indices, GPUBufferUsage.INDEX);
    const instanceBuffer = createStaticGpuBuffer(
      device,
      new Uint8Array(t.instanceBuffer, 0, t.instanceCount * INSTANCE_STRIDE_BYTES),
      GPUBufferUsage.VERTEX,
    );
    let rteDeltas;
    try {
      rteDeltas = createInstancedRteDeltaStream(device, t.instanceCount);
    } catch (error) {
      // Nothing references this template's buffers yet; free them rather than leak them.
      vertexBuffer.destroy(); indexBuffer.destroy(); instanceBuffer.destroy();
      throw error;
    }
    let selectedCount = 0;
    for (let i = 0; i < t.instanceCount; i++) {
      const eid = t.entityIds[i];
      // A shard can stream in AFTER a selection / colour override was recorded for its ids. setInstancedSelection
      // diffs by id and would early-return on the unchanged set, so seed the late occurrences here (#3890 for colour).
      if (selected.has(eid)) { selectedCount++; lateSelected.add(eid); }
      if (overrideColors?.has(eid)) lateOverridden.add(eid);
    }
    templates[templateIndex] = {
      modelIndex,
      vertexBuffer,
      indexBuffer,
      indexCount: t.indices.length,
      instanceBuffer,
      instanceCount: t.instanceCount,
      canonicalAnchors: t.canonicalAnchors,
      rteDeltas,
      bounds: cull.bounds,
      maxOccRadius: cull.maxOccRadius,
      selectedCount,
    };
  }
  return { lateSelected, lateOverridden };
}
