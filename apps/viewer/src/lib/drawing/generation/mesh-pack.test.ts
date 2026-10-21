/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pack the generation worker receives (#154) gives back every field the
 * generator reads, with the values it was given, absent fields absent; and a
 * pack reports itself stale when a mesh it was made from changed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { packCovers, packMeshes, packSourceOf, unpackMeshes } from './mesh-pack';

const full: MeshData = {
  expressId: 12, ifcType: 'IfcWall', modelIndex: 2, materialId: 77, geometryClass: 0,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0.1]), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]),
  color: [0.1, 0.2, 0.30000000000000004, 1], origin: [1000.25, 2.5, -3.125],
};
const bare: MeshData = {
  expressId: 13, positions: new Float32Array([5, 5, 5, 6, 5, 5, 5, 6, 5]), normals: new Float32Array(9), indices: new Uint32Array([2, 1, 0]), color: [1, 0, 0, 0.5],
};

/** What the generator reads of a mesh: everything but the normals. */
const read = ({ normals: _normals, ...rest }: MeshData) => ({ ...rest, positions: [...rest.positions], indices: [...rest.indices] });

describe('the generation worker\'s mesh pack', () => {
  for (const shared of [false, true]) {
    it(`gives back what the generator reads (${shared ? 'shared' : 'transferable'} buffers)`, async () => {
      const pack = await packMeshes([full, bare], shared);
      const back = unpackMeshes(structuredClone(pack));
      assert.deepEqual(back.map(read), [full, bare].map(read));
      assert.equal('ifcType' in back[1] || 'modelIndex' in back[1] || 'materialId' in back[1] || 'origin' in back[1], false, 'absent fields stay absent');
      assert.equal(pack.positions.buffer instanceof SharedArrayBuffer, shared);
    });
  }

  it('finds the meshes it holds, and is stale once one of them changes', () => {
    const a: MeshData = { ...full, color: [...full.color] };
    const b = { ...bare };
    const source = packSourceOf([a, b]);
    assert.deepEqual([...packCovers(source, [b])!], [1]);
    assert.equal(packCovers(source, [{ ...b }]), null, 'a mesh it was not made from');
    b.positions = new Float32Array(b.positions);
    assert.equal(packCovers(source, [b]), null, 'replaced positions');
    a.color[0] = 0.9;
    assert.equal(packCovers(source, [a]), null, 'a colour edited in place');
  });
});
