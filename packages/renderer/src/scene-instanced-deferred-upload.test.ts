/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Scene } from './scene.js';
import type { DecodedInstancedShard } from '@ifc-lite/geometry';

/**
 * `registerInstancedShard` / `uploadDeferredInstanced` (#154): the CPU records every non-rendering reader uses
 * (takeoff, quantities, exports, bounds) exist without a GPU device; the GPU half fills the same slots later.
 */

(globalThis as Record<string, unknown>).GPUBufferUsage = {
  MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16,
  VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512,
};

function fakeDevice(): { device: GPUDevice; created: unknown[] } {
  const created: unknown[] = [];
  const device = {
    limits: { maxBufferSize: 1 << 30, maxStorageBufferBindingSize: 1 << 30 },
    createBuffer: (desc: { size: number }) => {
      const backing = new ArrayBuffer(desc.size);
      const buf = { size: desc.size, getMappedRange: () => backing, unmap() {}, destroy() {} };
      created.push(buf);
      return buf;
    },
    queue: { writeBuffer: () => {} },
  };
  return { device: device as unknown as GPUDevice, created };
}

function shard(entityIds: number[]): DecodedInstancedShard {
  const templates = entityIds.map(() => ({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]), origin: [0, 0, 0] as [number, number, number],
  }));
  const instances = entityIds.map((entityId, t) => ({
    templateIndex: t, entityId, color: [1, 1, 1, 1] as [number, number, number, number],
    transform: new Float32Array([1, 0, 0, t, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  }));
  return { templates, instances, carriesItemIds: false };
}

describe('Scene: register now, upload later (#154)', () => {
  it('serves the CPU readers after register alone, creating no GPU buffer', () => {
    const scene = new Scene();
    scene.registerInstancedShard(shard([10, 11]), 3);
    assert.deepStrictEqual([...scene.getInstancedEntityIds()], [10, 11]);
    assert.strictEqual(scene.getInstancedMeshDataPieces(11)?.length, 1);
    assert.notStrictEqual(scene.getEntityBoundingBox(10), null);
    assert.strictEqual(scene.getInstancedTemplates().length, 0, 'nothing is drawable yet');
    assert.strictEqual(scene.hasDeferredInstancedUploads(), true);
    assert.deepStrictEqual(scene.getInstancedModelIndices(), [3]);
  });

  it('uploads what was registered, in order, into the slots it reserved', () => {
    const scene = new Scene();
    const { device, created } = fakeDevice();
    scene.registerInstancedShard(shard([10, 11]), 3);
    scene.registerInstancedShard(shard([20]), 7);
    assert.strictEqual(created.length, 0);
    scene.uploadDeferredInstanced(device);
    assert.strictEqual(scene.hasDeferredInstancedUploads(), false);
    assert.deepStrictEqual(scene.getInstancedTemplates().map((t) => t.modelIndex), [3, 3, 7]);
    const direct = fakeDevice();
    const reference = new Scene();
    reference.addInstancedShard(direct.device, shard([10, 11]), 3);
    reference.addInstancedShard(direct.device, shard([20]), 7);
    assert.strictEqual(created.length, direct.created.length, 'the same buffers as uploading each shard directly');
    assert.ok(created.length > 0);
  });

  it('addInstancedShard is both halves at once', () => {
    const scene = new Scene();
    const { device } = fakeDevice();
    scene.addInstancedShard(device, shard([10]), 0);
    assert.strictEqual(scene.getInstancedTemplates().length, 1);
    assert.strictEqual(scene.hasDeferredInstancedUploads(), false);
  });

  it('drops a removed model\'s registered templates so they never upload', () => {
    const scene = new Scene();
    const { device } = fakeDevice();
    scene.registerInstancedShard(shard([10]), 3);
    scene.registerInstancedShard(shard([20]), 7);
    assert.strictEqual(scene.removeInstancedTemplatesForModel(3), 1);
    assert.deepStrictEqual([...scene.getInstancedEntityIds()], [20]);
    scene.uploadDeferredInstanced(device);
    assert.deepStrictEqual(scene.getInstancedTemplates().map((t) => t.modelIndex), [7]);
  });

  it('clear() forgets registered templates', () => {
    const scene = new Scene();
    scene.registerInstancedShard(shard([10]), 0);
    scene.clear();
    assert.strictEqual(scene.hasDeferredInstancedUploads(), false);
    assert.deepStrictEqual([...scene.getInstancedEntityIds()], []);
  });
});
