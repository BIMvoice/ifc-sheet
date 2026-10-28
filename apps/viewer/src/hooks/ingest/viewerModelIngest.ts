/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CompactEntityIndex, parseIfcx, buildIfcxDataStore, createSyntheticDataStore, type IfcDataStore, type PointCloudExtraction } from '@ifc-lite/parser';
import { convertIfcxMeshes, type GeometryResult, type MeshData, type PointCloudAsset } from '@ifc-lite/geometry';
import { parseGLB, parseGLBToMeshData, parseGLBImageResources } from '@ifc-lite/cache';
import type { SchemaVersion } from '../../store/types.js';
import { calculateMeshBounds, createCoordinateInfo } from '../../utils/localParsingUtils.js';

export interface ViewerModelPayload {
  dataStore: IfcDataStore;
  geometryResult: GeometryResult;
  schemaVersion: SchemaVersion;
  /** Encoded GLB base-colour images, retained through the canonical load owner. */
  originalResources?: Map<string, Uint8Array>;
  /** IFCX path ↔ expressId maps (only present for IFCX-parsed models). */
  pathToId?: Map<string, number>;
  idToPath?: Map<number, string>;
}

export interface ParseIfcxOptions {
  /**
   * Allow reconstructing a model from IFCX that carries entities but no inline
   * geometry (used by collab recipients, whose geometry arrives via blobs).
   * Without this, geometry-less IFCX throws `overlay-only-ifcx`.
   */
  allowEmptyGeometry?: boolean;
}

/** The IFCX store and mesh builders are shared with the command line (`@bimvoice/ifcsheet`'s `openModel`): one reader, not two. */
export { buildIfcxDataStore, convertIfcxMeshes };

export function getViewerSchemaVersion(dataStore: IfcDataStore | null): SchemaVersion {
  if (!dataStore) return 'IFC4';
  if (dataStore.schemaVersion === 'IFC4X3') return 'IFC4X3';
  if (dataStore.schemaVersion === 'IFC4') return 'IFC4';
  if (dataStore.schemaVersion === 'IFC5') return 'IFC5';
  return 'IFC2X3';
}

export function createMinimalGlbDataStore(buffer: ArrayBuffer, meshCount: number): IfcDataStore {
  // A GLB carries renderable meshes but no IFC entities. Build a typed,
  // entity-less store via the shared factory so the full `IfcDataStore`
  // contract (including the lazy `getEntity` / `getProperties` accessors the
  // query path calls) is compiler-enforced instead of cast away (#1004).
  return createSyntheticDataStore({
    schemaVersion: 'IFC4',
    fileSize: buffer.byteLength,
    entityCount: meshCount,
  });
}

export function getMaxExpressId(
  dataStore: IfcDataStore | null,
  meshes: MeshData[],
  pointClouds: readonly Pick<PointCloudAsset, 'expressId'>[] = [],
): number {
  const maxExpressIdFromMeshes = meshes.reduce((max, mesh) => Math.max(max, mesh.expressId), 0);
  let maxExpressIdFromEntities = 0;
  // @raw-entity-enumeration-ok load-time watermark scans parsed source ids before any live overlay is installed
  const entityIndex = dataStore?.entityIndex?.byId;
  if (entityIndex instanceof CompactEntityIndex) {
    maxExpressIdFromEntities = entityIndex.maxExpressId;
  } else if (entityIndex) {
    for (const key of entityIndex.keys()) {
      if (key > maxExpressIdFromEntities) {
        maxExpressIdFromEntities = key;
      }
    }
  }
  // IFCX has no STEP byte-offset index. Its parsed entity table owns spatial
  // and other unmeshed rows too; reserving only rendered IDs strands those
  // rows outside the strict federation range (#6564).
  if (dataStore?.schemaVersion === 'IFC5') {
    // @raw-entity-enumeration-ok load-time IFCX ownership watermark precedes installation of live overlays
    for (const id of dataStore.entities.expressId) {
      maxExpressIdFromEntities = Math.max(maxExpressIdFromEntities, id);
    }
  }
  const maxExpressIdFromPoints = pointClouds.reduce((max, asset) => Math.max(max, asset.expressId), 0);
  return Math.max(maxExpressIdFromMeshes, maxExpressIdFromEntities, maxExpressIdFromPoints);
}

export async function parseIfcxViewerModel(
  buffer: ArrayBuffer,
  onProgress?: (progress: { phase: string; percent: number }) => void,
  opts?: ParseIfcxOptions,
): Promise<ViewerModelPayload> {
  const ifcxResult = await parseIfcx(buffer, {
    onProgress: (progress) => {
      onProgress?.({
        phase: `IFCX ${progress.phase}`,
        percent: 10 + (progress.percent * 0.8),
      });
    },
  });

  const meshes = convertIfcxMeshes(ifcxResult.meshes);
  const pointClouds = convertIfcxPointClouds(ifcxResult.pointClouds ?? []);
  // Treat as overlay-only ONLY when neither meshes nor pointclouds were extracted.
  // Files that carry just point cloud assets (the buildingSMART Point_Cloud
  // samples) still represent a renderable model on their own.
  if (
    !opts?.allowEmptyGeometry &&
    meshes.length === 0 &&
    pointClouds.length === 0 &&
    ifcxResult.entityCount > 0
  ) {
    throw new Error('overlay-only-ifcx');
  }

  const { bounds, stats } = calculateMeshBounds(meshes);
  // Empty geometry (e.g. a collab recipient reconstructing before blob hydration
  // with `allowEmptyGeometry`): calculateMeshBounds returns ±Infinity sentinels,
  // which make coordinateInfo invalid. Collapse to a zero box; real bounds arrive
  // once meshes hydrate.
  if (meshes.length === 0 && pointClouds.length === 0) {
    bounds.min = { x: 0, y: 0, z: 0 };
    bounds.max = { x: 0, y: 0, z: 0 };
  }
  // Expand bounds to include point cloud asset extents so fit-to-view, the
  // section-plane slider, and camera near/far all see the points too.
  for (const pc of pointClouds) {
    const { min, max } = pc.chunk.bbox;
    bounds.min.x = Math.min(bounds.min.x, min[0]);
    bounds.min.y = Math.min(bounds.min.y, min[1]);
    bounds.min.z = Math.min(bounds.min.z, min[2]);
    bounds.max.x = Math.max(bounds.max.x, max[0]);
    bounds.max.y = Math.max(bounds.max.y, max[1]);
    bounds.max.z = Math.max(bounds.max.z, max[2]);
  }
  return {
    dataStore: buildIfcxDataStore(ifcxResult, buffer),
    geometryResult: {
      meshes,
      pointClouds,
      totalVertices: stats.totalVertices,
      totalTriangles: stats.totalTriangles,
      coordinateInfo: createCoordinateInfo(bounds),
    },
    schemaVersion: 'IFC5',
    pathToId: ifcxResult.pathToId,
    idToPath: ifcxResult.idToPath,
  };
}

export function convertIfcxPointClouds(extractions: PointCloudExtraction[]): PointCloudAsset[] {
  return extractions.map((pc) => ({
    expressId: pc.expressId,
    ifcType: pc.ifcType,
    chunk: {
      positions: pc.positions,
      colors: pc.colors,
      pointCount: pc.pointCount,
      bbox: pc.bbox,
    },
  }));
}

export async function parseGlbViewerModel(buffer: ArrayBuffer): Promise<ViewerModelPayload> {
  const { json, bin } = parseGLB(new Uint8Array(buffer));
  if (!bin) throw new Error('GLB has no binary buffer');
  const meshes = parseGLBToMeshData(json, bin);
  const originalResources = parseGLBImageResources(json, bin);
  if (meshes.length === 0) {
    throw new Error('glb-empty');
  }

  const { bounds, stats } = calculateMeshBounds(meshes);
  return {
    originalResources,
    dataStore: createMinimalGlbDataStore(buffer, meshes.length),
    geometryResult: {
      meshes,
      totalVertices: stats.totalVertices,
      totalTriangles: stats.totalTriangles,
      coordinateInfo: createCoordinateInfo(bounds),
    },
    schemaVersion: 'IFC4',
  };
}
