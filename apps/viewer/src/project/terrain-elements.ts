/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The terrain a project plan leaves out (#683). The engine cuts the building's meshes, which are the storeys' elements without the
 * ground (`storeyElementIds`), so a plan does not cut the terrain Bonsai puts in a storey. Sections and elevations keep it: the ground
 * drawing (`ground.ts`) turns it into the earth cut and the ground line. The terrain is told by the one rule the engine uses
 * (`isTerrainMesh`): a tree or a boring point is not.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';
import { isTerrainMesh, predefinedTypeReader } from '@bimvoice/ifcsheet';
import { useViewerStore } from '@/store';

/** The store when it is a whole one (a test may hand over a stub with a spatial hierarchy only, which cannot tell a PredefinedType). */
const fullStore = (store: object | null | undefined): IfcDataStore | null => (store && 'entities' in store && store.entities ? (store as IfcDataStore) : null);

/**
 * Whether a mesh is a terrain, read from the store of the model that owns it (`isTerrainMesh`). `legacy` is the single loaded
 * model's store, read when no federated model is loaded (global id = express id); it defaults to the viewer's own.
 */
export function terrainTester(legacy?: object | null): (mesh: MeshData) => boolean {
  const state = useViewerStore.getState();
  const single = fullStore(legacy) ?? state.ifcDataStore;
  const readers = new Map<string, (id: number) => string | null>();
  return (mesh) => {
    if (mesh.ifcType?.toUpperCase() !== 'IFCGEOGRAPHICELEMENT') return false;
    const owner = state.models.size > 0 ? state.resolveGlobalIdFromModels(mesh.expressId) : null;
    // A global id no federated model owns is not read as a local one from the legacy store.
    const store = owner ? state.models.get(owner.modelId)?.ifcDataStore : state.models.size > 0 ? null : single;
    // Without a store to read the PredefinedType from, a geographic element states none: a terrain.
    if (!store?.entities) return isTerrainMesh(mesh);
    const key = owner?.modelId ?? '';
    let reader = readers.get(key);
    if (!reader) readers.set(key, (reader = predefinedTypeReader(store)));
    return isTerrainMesh({ ...mesh, expressId: owner?.expressId ?? mesh.expressId }, reader);
  };
}

/** `meshes` without the terrain (see {@link terrainTester}); the same array when it holds none. */
export function withoutTerrainMeshes(meshes: MeshData[], legacy?: object | null): MeshData[] {
  if (!meshes.some((m) => m.ifcType?.toUpperCase() === 'IFCGEOGRAPHICELEMENT')) return meshes;
  const isTerrain = terrainTester(legacy);
  return meshes.filter((mesh) => !isTerrain(mesh));
}
