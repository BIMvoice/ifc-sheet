/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { MeshData } from './types.js';

/** A mesh as the IFCX reader produces it (either id spelling, optional colour). */
export interface RawIfcxMesh {
  expressId?: number;
  express_id?: number;
  id?: number;
  positions: Float32Array | number[];
  indices: Uint32Array | number[];
  normals: Float32Array | number[];
  color?: [number, number, number, number] | [number, number, number];
  ifcType?: string;
  ifc_type?: string;
  uvs?: Float32Array;
  texture?: MeshData['texture'];
}

const DEFAULT_COLOR: [number, number, number, number] = [0.7, 0.7, 0.7, 1.0];

function colorOf(color?: readonly number[]): [number, number, number, number] {
  if (!color || color.length < 3) return DEFAULT_COLOR;
  if (color.length === 4) return color as [number, number, number, number];
  return [color[0], color[1], color[2], 1.0];
}

/** The IFCX reader's meshes as renderable `MeshData`, the empty ones dropped. The app and the command line both go through this. */
export function convertIfcxMeshes(rawMeshes: RawIfcxMesh[]): MeshData[] {
  return rawMeshes.map((mesh) => {
    const positions = mesh.positions instanceof Float32Array ? mesh.positions : new Float32Array(mesh.positions || []);
    const indices = mesh.indices instanceof Uint32Array ? mesh.indices : new Uint32Array(mesh.indices || []);
    const normals = mesh.normals instanceof Float32Array ? mesh.normals : new Float32Array(mesh.normals || []);
    return {
      expressId: mesh.expressId ?? mesh.express_id ?? mesh.id ?? 0,
      positions,
      indices,
      normals,
      uvs: mesh.uvs,
      texture: mesh.texture,
      color: colorOf(mesh.color),
      ifcType: mesh.ifcType ?? mesh.ifc_type ?? 'IfcProduct',
    };
  }).filter((mesh) => mesh.positions.length > 0 && mesh.indices.length > 0);
}
