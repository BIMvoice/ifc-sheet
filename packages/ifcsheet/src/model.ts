/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An IFC model as the drawing-set engine reads it, opened without a browser:
 * the parser for the storeys, rooms and stairs, the wasm geometry engine for
 * the meshes the set is measured on and the drawings are cut from. The same
 * reads the web app makes from its stores (`project/model-levels.ts`,
 * `project/model-rooms.ts`), here over one parsed model.
 */

import { IfcTypeEnum, iterateEffectiveEntities, type SpatialNode } from '@ifc-lite/data';
import { GeometryProcessor, type GeometryResult, type MeshData } from '@ifc-lite/geometry';
import { IfcParser, extractLengthUnitScale, type IfcDataStore } from '@ifc-lite/parser';
import type { ModelExtent } from './drawing-set.js';
import type { ProjectLevel } from './document.js';
import { createEntityBoundsLookup, type BoundingBox3D } from './entity-bounds.js';
import { farElementLabel, frameEntities } from './framing.js';
import { storeyFloorY } from './storey-origin.js';
import type { Footprint, ProposalInput, RoomFootprint } from './section-proposals.js';
import type { StoreyInput } from './view-defaults.js';

export interface OpenModelOptions {
  /**
   * Run the wasm geometry engine (default true). Without it the model has
   * storeys but no extent, so no set can be laid out; reading the storeys of
   * a model is all it is good for.
   */
  geometry?: boolean;
  /** Frame the views on everything the storeys contain, small far-away elements too (the project setting "include far-away elements in framing", `framing.ts`). Default false. */
  includeFarElements?: boolean;
}

/** A small element the views are framed without, because it lies far from the building (`framing.ts`). */
export interface FarElementInfo {
  expressId: number;
  /** Its Name, else its class and GlobalId: what a message calls it. */
  label: string;
  /** Metres from the building (the frame without it). */
  distance: number;
}

/** A model opened by {@link openModel}. */
export interface OpenedModel {
  /** The IfcProject's LongName, else its Name (what the app's title block prints for the project by default), else empty. */
  projectName: string;
  /** Every building storey: name, IfcBuildingStorey.Elevation (metres) and GlobalId. */
  storeys: StoreyInput[];
  /** The meshes, in the viewer frame (metres, Y up); empty without geometry. */
  meshes: MeshData[];
  /** The meshes of what the storeys contain (the building the set is measured on, without the site around it): what the sheets' drawings are cut from. */
  buildingMeshes: MeshData[];
  /** The box of the building (what the storeys contain, without the small elements far from it, `farElements`) the set is measured on; `null` without geometry or when no storey holds any. */
  extent: ModelExtent | null;
  /** The elements the extent leaves out, farthest first; they are still in `meshes`, `buildingMeshes` and the schedules. Empty with `includeFarElements`. */
  farElements: FarElementInfo[];
  /** Whether the model was opened with `includeFarElements`. */
  includeFarElements: boolean;
  /** The rooms and stairs of `level` and the building's footprint, for the proposed sections; `null` without an extent. */
  proposalInput(level: ProjectLevel): ProposalInput | null;
  /** The parsed model, for reads the engine does not make itself. */
  dataStore: IfcDataStore;
}

const footprint = (b: BoundingBox3D): Footprint => ({ min: { x: b.min.x, z: b.min.z }, max: { x: b.max.x, z: b.max.z } });

/** Every IfcSpace under `node`, however deep (spaces may sit in zones or sub-spaces). */
function spacesUnder(node: SpatialNode, out: SpatialNode[] = []): SpatialNode[] {
  for (const child of node.children) {
    if (child.type === IfcTypeEnum.IfcSpace) out.push(child);
    spacesUnder(child, out);
  }
  return out;
}

function findStoreys(node: SpatialNode, wanted: (id: number) => boolean, out: SpatialNode[] = []): SpatialNode[] {
  if (node.type === IfcTypeEnum.IfcBuildingStorey && wanted(node.expressId)) out.push(node);
  for (const child of node.children) findStoreys(child, wanted, out);
  return out;
}

/** The model's length unit in metres, the way the app reads it (`getIfcLengthUnitScale`). */
function lengthUnitScaleOf(ds: IfcDataStore): number {
  if (ds.lengthUnitScale !== undefined) return ds.lengthUnitScale;
  if (!ds.source?.length || !ds.entityIndex) return 1;
  return extractLengthUnitScale(ds.source, ds.entityIndex);
}

/**
 * The model's storeys as the app's level list reads them: every storey of the
 * spatial hierarchy, unsorted, each with its floor in the meshes' frame
 * (`floorY`) when its placement resolves. `Elevation` alone is not that
 * height: a model that keeps its real height in the site's placement (the
 * Skolebygg sample: RefElevation 131.2 m) is meshed at it, and a plan cut at
 * `elevation + 1.2` would pass below the whole building.
 */
function storeysOf(ds: IfcDataStore, frame: GeometryResult['coordinateInfo'] | undefined): StoreyInput[] {
  const hierarchy = ds.spatialHierarchy;
  if (!hierarchy) return [];
  const unit = lengthUnitScaleOf(ds);
  return [...hierarchy.byStorey.keys()].map((id) => {
    const floorY = storeyFloorY(ds, id, unit, frame);
    return {
      name: ds.entities.getName(id) || `Storey #${id}`,
      elevation: hierarchy.storeyElevations.get(id) ?? 0,
      globalId: ds.entities.getGlobalId(id) || undefined,
      ...(floorY !== null ? { floorY } : {}),
    };
  });
}

/** The elements the storeys contain: the building without the site around it (`buildingExtent` in `project/model-rooms.ts` reads the same, and frames it through `frameEntities` too). */
function buildingIds(ds: IfcDataStore, storeys: readonly StoreyInput[]): number[] {
  const hierarchy = ds.spatialHierarchy;
  if (!hierarchy) return [];
  const wanted = new Set(storeys.flatMap((s) => (s.globalId ? [s.globalId] : [])));
  const ids: number[] = [];
  for (const storey of findStoreys(hierarchy.project, (id) => wanted.has(ds.entities.getGlobalId(id) ?? ''))) {
    for (const id of hierarchy.byStorey.get(storey.expressId) ?? []) ids.push(id);
  }
  return ids;
}

/** The rooms and stairs of `level` and the building's footprint (`project/model-rooms.ts` reads the same from the app's stores). */
function proposalInputOf(ds: IfcDataStore, meshes: MeshData[], extent: ModelExtent | null, level: ProjectLevel): ProposalInput | null {
  const hierarchy = ds.spatialHierarchy;
  if (!extent || !hierarchy) return null;
  const boundsOf = createEntityBoundsLookup(meshes);
  const wanted = new Set(level.storeyGlobalIds);
  const storeys = findStoreys(hierarchy.project, (id) => wanted.has(ds.entities.getGlobalId(id) ?? ''));
  const storeyIds = new Set(storeys.map((n) => n.expressId));
  const rooms: RoomFootprint[] = [];
  for (const storey of storeys) {
    for (const space of spacesUnder(storey)) {
      const b = boundsOf(space.expressId);
      if (b) rooms.push({ id: ds.entities.getGlobalId(space.expressId) || `#${space.expressId}`, storey: storey.longName || storey.name || undefined, name: space.longName || space.name || `Room ${space.expressId}`, ...footprint(b) });
    }
  }
  const stairs: Footprint[] = [];
  for (const { expressId } of iterateEffectiveEntities(ds, null, ['IFCSTAIR', 'IFCSTAIRFLIGHT'])) {
    const storey = hierarchy.elementToStorey.get(expressId) ?? null;
    if (storey === null || !storeyIds.has(storey)) continue;
    const b = boundsOf(expressId);
    if (b) stairs.push(footprint(b));
  }
  return { building: { min: { x: extent.min.x, z: extent.min.z }, max: { x: extent.max.x, z: extent.max.z } }, rooms, stairs };
}

/**
 * Open an IFC model from its bytes: parse it and, unless asked not to, mesh
 * it with the wasm geometry engine. In Node the engine reads its `.wasm` from
 * the `@ifc-lite/wasm` package on disk.
 */
export async function openModel(bytes: Uint8Array, options: OpenModelOptions = {}): Promise<OpenedModel> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const ds = await new IfcParser().parseColumnar(buffer);
  let meshes: MeshData[] = [];
  let frame: GeometryResult['coordinateInfo'] | undefined;
  if (options.geometry !== false) {
    const processor = new GeometryProcessor();
    try {
      await processor.init();
      const result = await processor.process(new Uint8Array(buffer));
      meshes = result.meshes;
      frame = result.coordinateInfo;
    } finally {
      processor.dispose();
    }
  }
  const storeys = storeysOf(ds, frame);
  const ids = buildingIds(ds, storeys);
  const includeFarElements = options.includeFarElements === true;
  const framing = ids.length && meshes.length ? frameEntities(meshes, ids, { includeFar: includeFarElements }) : null;
  const extent = framing?.extent ?? null;
  const farElements = (framing?.farElements ?? []).map((f): FarElementInfo => ({
    expressId: f.key,
    label: farElementLabel({ name: ds.entities.getName(f.key), type: ds.entities.getTypeName(f.key), globalId: ds.entities.getGlobalId(f.key) }),
    distance: f.distance,
  }));
  const inBuilding = new Set(ids);
  const project = ds.spatialHierarchy?.project;
  return {
    projectName: project?.longName || project?.name || '',
    storeys,
    meshes,
    buildingMeshes: meshes.filter((m) => inBuilding.has(m.expressId)),
    extent,
    farElements,
    includeFarElements,
    proposalInput: (level) => proposalInputOf(ds, meshes, extent, level),
    dataStore: ds,
  };
}
