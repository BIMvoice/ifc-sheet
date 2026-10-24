/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `appendToBatches(..., deferUpload)` (#154): the viewer holds the 3D scene's
 * GPU upload back while the viewport is covered. The meshes are registered,
 * their buckets stay pending, and `takeDeferredBatchUpload()` says, once, that
 * a rebuild is owed. Once means once: a rebuild that then fails is not owed
 * again every frame (the pending buckets stay for the next rebuild to retry).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { Scene } from './scene.js';
import type { RenderPipeline } from './pipeline.js';

(globalThis as Record<string, unknown>).GPUBufferUsage = { COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64 };

const mesh = (expressId: number): MeshData => ({
  expressId,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  color: [1, 1, 1, 1],
}) as unknown as MeshData;

function gpu(opts: { fail?: () => boolean } = {}) {
  const counts = { buffers: 0 };
  const device = {
    limits: { maxBufferSize: 1 << 30, maxStorageBufferBindingSize: 1 << 30 },
    createBuffer: ({ size }: GPUBufferDescriptor) => {
      if (opts.fail?.()) throw new Error('createBuffer failed');
      counts.buffers++;
      return { size, destroy() {} };
    },
    createBindGroup: () => ({}),
    queue: { writeBuffer() {} },
  } as unknown as GPUDevice;
  const pipeline = { getUniformBufferSize: () => 256, getBindGroupLayout: () => ({}) } as unknown as RenderPipeline;
  return { device, pipeline, counts };
}

describe('Scene deferred batch upload (#154)', () => {
  it('registers the meshes with no GPU buffer, and owes the upload once', () => {
    const { device, pipeline, counts } = gpu();
    const scene = new Scene();
    scene.appendToBatches([mesh(1), mesh(2)], device, pipeline, false, true);
    assert.equal(counts.buffers, 0);
    assert.equal(scene.getBatchedMeshes().length, 0);
    assert.ok(scene.getMeshDataPieces(1)?.length, 'CPU-side data is there');
    assert.equal(scene.takeDeferredBatchUpload(), true);
    assert.equal(scene.takeDeferredBatchUpload(), false, 'owed once');
    scene.rebuildPendingBatches(device, pipeline);
    assert.ok(counts.buffers > 0);
    assert.equal(scene.getBatchedMeshes().length, 1);
  });

  it('is not owed again after a failed rebuild, and the next rebuild still uploads', () => {
    let failing = true;
    const { device, pipeline, counts } = gpu({ fail: () => failing });
    const scene = new Scene();
    scene.appendToBatches([mesh(1)], device, pipeline, false, true);
    assert.equal(scene.takeDeferredBatchUpload(), true);
    assert.throws(() => scene.rebuildPendingBatches(device, pipeline), /createBuffer failed/);
    assert.equal(scene.takeDeferredBatchUpload(), false, 'a failure does not retry every frame');
    assert.ok(scene.hasPendingBatches(), 'the buckets stay pending');
    failing = false;
    scene.rebuildPendingBatches(device, pipeline);
    assert.ok(counts.buffers > 0);
    assert.equal(scene.getBatchedMeshes().length, 1);
  });

  it('owes nothing once an ordinary rebuild has paid it', () => {
    const { device, pipeline } = gpu();
    const scene = new Scene();
    scene.appendToBatches([mesh(1)], device, pipeline, false, true);
    scene.appendToBatches([mesh(2)], device, pipeline, false, false);
    assert.equal(scene.getBatchedMeshes().length, 1, 'the uncovered append uploaded both');
    assert.ok(scene.removeMeshesForEntity(2) && scene.hasPendingBatches(), 'a removal leaves its bucket pending for its caller');
    assert.equal(scene.takeDeferredBatchUpload(), false, 'that pending bucket is not a deferred upload');
  });

  it('owes nothing once the scene was cleared before the upload', () => {
    const { device, pipeline, counts } = gpu();
    const scene = new Scene();
    scene.appendToBatches([mesh(1)], device, pipeline, false, true);
    scene.clear();
    assert.equal(scene.takeDeferredBatchUpload(), false);
    assert.equal(counts.buffers, 0);
  });

  it('uploads at once without deferUpload, as before', () => {
    const { device, pipeline, counts } = gpu();
    const scene = new Scene();
    scene.appendToBatches([mesh(1)], device, pipeline);
    assert.ok(counts.buffers > 0);
    assert.equal(scene.takeDeferredBatchUpload(), false);
  });
});
