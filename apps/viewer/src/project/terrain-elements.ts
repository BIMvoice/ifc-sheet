/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The terrain the sections and elevations leave out (#683). The engine cuts the building's meshes, which are the
 * storeys' elements without the ground (`storeyElementIds`); the app cuts every mesh of the model, so a terrain a model
 * contains in a storey (Bonsai writes its ground box so) was cut as a grey block and drawn as a big rectangle. The terrain
 * is told by the one rule the engine uses (`isTerrainMesh`, `isTerrainPredefinedType`): a tree or a boring point is not.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';
import { isTerrainMesh, predefinedTypeReader } from '@bimvoice/ifcsheet';
import { useViewerStore } from '@/store';

/**
 * Whether a mesh is a terrain, read from the store of the model that owns it (`isTerrainMesh`). `legacy` is the single loaded
 * model's store, read when no federated model is loaded (global id = express id); it defaults to the viewer's own.
 */
export function terrainTester(legacy?: IfcDataStore | null): (mesh: MeshData) => boolean {
  const state = useViewerStore.getState();
  const single = legacy ?? state.ifcDataStore;
  const readers = new Map<string, (id: number) => string | null>();
  return (mesh) => {
    if (mesh.ifcType?.toUpperCase() !== 'IFCGEOGRAPHICELEMENT') return false;
    const owner = state.models.size > 0 ? state.resolveGlobalIdFromModels(mesh.expressId) : null;
    const store = owner ? state.models.get(owner.modelId)?.ifcDataStore : single;
    // Without a store to read the PredefinedType from, a geographic element states none: a terrain.
    if (!store?.entities) return isTerrainMesh(mesh);
    const key = owner?.modelId ?? '';
    let reader = readers.get(key);
    if (!reader) readers.set(key, (reader = predefinedTypeReader(store)));
    return isTerrainMesh({ ...mesh, expressId: owner?.expressId ?? mesh.expressId }, reader);
  };
}

/** `meshes` without the terrain (see {@link terrainTester}); the same array when it holds none. */
export function withoutTerrainMeshes(meshes: MeshData[], legacy?: IfcDataStore | null): MeshData[] {
  if (!meshes.some((m) => m.ifcType?.toUpperCase() === 'IFCGEOGRAPHICELEMENT')) return meshes;
  const isTerrain = terrainTester(legacy);
  return meshes.filter((mesh) => !isTerrain(mesh));
}
