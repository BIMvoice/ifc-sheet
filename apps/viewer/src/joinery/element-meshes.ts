/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The meshes of one element of a loaded model, for the quantities measured
 * from geometry (#74, `measured-quantities.ts` in the engine): the pieces the
 * viewer draws, by the element's express id. Grouped once per model and only
 * when first asked, since a model with Qto sets never asks.
 *
 * An element drawn by GPU instancing has no flat mesh in `geometryResult`; its
 * pieces come from the live renderer's scene, as the urban indicators read them.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { FederatedModel } from '@/store/types';
import { getGlobalRenderer } from '@/hooks/useBCF';

/** World-space pieces of a GPU-instanced element, by global id. */
export type InstancedMeshes = (globalId: number) => readonly MeshData[] | undefined;

const rendererMeshes: InstancedMeshes = (globalId) => getGlobalRenderer()?.getScene().getInstancedMeshDataPieces(globalId);

/**
 * `(expressId) => pieces` for one model. One occurrence only: pieces of the
 * same element with another `occurrenceKey` are a second placement of it, not
 * more of its body. Type templates (`geometryClass` 2) are never an element's.
 */
export function elementMeshLookup(model: Pick<FederatedModel, 'geometryResult' | 'idOffset'>, instanced: InstancedMeshes = rendererMeshes): (expressId: number) => readonly MeshData[] | undefined {
  let byId: Map<number, MeshData[]> | null = null;
  const offset = model.idOffset ?? 0;
  return (expressId) => {
    if (!byId) {
      byId = new Map();
      const occurrence = new Map<number, string | undefined>();
      for (const mesh of model.geometryResult?.meshes ?? []) {
        if ((mesh.geometryClass ?? 0) === 2) continue;
        const list = byId.get(mesh.expressId);
        if (!list) {
          byId.set(mesh.expressId, [mesh]);
          occurrence.set(mesh.expressId, mesh.occurrenceKey);
        } else if (occurrence.get(mesh.expressId) === mesh.occurrenceKey) list.push(mesh);
      }
    }
    const global = expressId + offset;
    return byId.get(global) ?? instanced(global);
  };
}
