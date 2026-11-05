/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { MeshData } from '@ifc-lite/geometry';

/** A grid of 1 m cells over `nx` by `nz` metres, `y` the height at each vertex: a TIN as the viewer holds it (x east, y up, z south). */
export function grid(nx: number, nz: number, y: (x: number, z: number) => number, origin?: [number, number, number]): MeshData {
  const positions: number[] = [];
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) positions.push(x, y(x, z), z);
  const indices: number[] = [];
  const at = (x: number, z: number) => z * (nx + 1) + x;
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) indices.push(at(x, z), at(x + 1, z), at(x + 1, z + 1), at(x, z), at(x + 1, z + 1), at(x, z + 1));
  return {
    expressId: 7, ifcType: 'IfcGeographicElement', positions: new Float32Array(positions), normals: new Float32Array(positions.length), indices: new Uint32Array(indices),
    color: [0.4, 0.6, 0.3, 1], ...(origin ? { origin } : {}),
  };
}
