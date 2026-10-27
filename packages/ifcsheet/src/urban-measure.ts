/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The storeys of a building measured into `urbanIndicators`' input: what stands on each level, outlined (`urban-footprint.ts`).
 * The one place the walls, columns, curtain walls and non-roof slabs of a level are gathered and counted as measured or not, for
 * the app (over its loaded models, mutation views and GPU-instanced elements) and the command line (over one opened model).
 * Each caller says how to read its models (`UrbanModelRead`); the rule is here. The wasm 2D booleans must be initialised.
 */

import { extractAllEntityAttributes, extractProjectUnits, ProjectUnits, type IfcDataStore } from '@ifc-lite/parser';
import { iterateEffectiveEntityIds } from '@ifc-lite/mutations';
import { storeyFootprint, type PlanMesh } from './urban-footprint.js';
import type { StoreyInput } from './urban-indicators.js';

/** What draws a storey's outline. */
export const URBAN_ENCLOSURE = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE', 'IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE', 'IFCCURTAINWALL']);

/** The classes `measureStoreys` asks `UrbanModelRead.ids` for. */
export const URBAN_FOOTPRINT_CLASSES: readonly string[] = [...URBAN_ENCLOSURE, 'IFCSLAB', 'IFCSPACE'];

/** One model as the measure reads it. */
export interface UrbanModelRead {
  /** The entities of `URBAN_FOOTPRINT_CLASSES` that stand (deleted ones left out): express id and IFC class. */
  ids: Iterable<{ expressId: number; type: string }>;
  /** The project level (index into the levels) the element is on; null when it is on none. */
  levelOf(id: number): number | null;
  /** Whether the slab is a roof (a roof does not tell rooms from courtyards). */
  isRoofSlab(id: number): boolean;
  /** The meshes that draw the element; absent or empty when it has none. */
  meshesOf(id: number): readonly PlanMesh[] | undefined;
}

export interface MeasuredStoreys {
  storeys: StoreyInput[];
  /** Names of the levels whose holes were all taken as inside (walls, no slab or room). */
  assumedInterior: string[];
}

/** The levels' storeys with their footprints; a wall or slab with no mesh, or whose outline fails, is counted per level as unmeasured. */
export function measureStoreys(levels: readonly { name: string; elevation: number }[], models: Iterable<UrbanModelRead>): MeasuredStoreys {
  const buckets = levels.map(() => ({ enclosure: [] as PlanMesh[][], floor: [] as PlanMesh[][], slabs: new Set<number>(), missing: 0 }));
  for (const model of models) {
    for (const { expressId: id, type } of model.ids) {
      const upper = type.toUpperCase();
      const room = upper === 'IFCSPACE';
      if (upper === 'IFCSLAB' && model.isRoofSlab(id)) continue;
      const level = model.levelOf(id);
      if (level === null) continue;
      const bucket = buckets[level];
      const meshes = model.meshesOf(id);
      if (!meshes?.length) {
        // A room without a body only helps tell rooms from courtyards; a wall or slab without one is area not measured.
        if (!room) bucket.missing++;
        continue;
      }
      if (URBAN_ENCLOSURE.has(upper)) bucket.enclosure.push([...meshes]);
      else {
        if (!room) bucket.slabs.add(bucket.floor.length);
        bucket.floor.push([...meshes]);
      }
    }
  }
  const assumedInterior: string[] = [];
  const storeys = levels.map((level, i) => {
    const b = buckets[i];
    const footprint = storeyFootprint(b.enclosure, b.floor);
    if (footprint.assumedInterior) assumedInterior.push(level.name);
    const failed = footprint.unmeasured.enclosure.length + footprint.unmeasured.floor.filter((k) => b.slabs.has(k)).length;
    return { name: level.name, elevation: level.elevation, footprint: footprint.shapes.length ? footprint.shapes : null, unmeasured: b.missing + failed };
  });
  return { storeys, assumedInterior };
}

/** The mesh lists of a model by express id (a mesh carries the id of its element). */
export function meshesById(meshes: Iterable<PlanMesh & { expressId: number }>): Map<number, PlanMesh[]> {
  const flat = new Map<number, PlanMesh[]>();
  for (const mesh of meshes) {
    const list = flat.get(mesh.expressId);
    if (list) list.push(mesh); else flat.set(mesh.expressId, [mesh]);
  }
  return flat;
}

/** The first building's ElevationOfRefHeight in metres, read off the source; null when it states none. */
export function buildingRefElevationOf(store: IfcDataStore): number | null {
  for (const { expressId: id } of iterateEffectiveEntityIds(store, null, ['IFCBUILDING'])) {
    const value = store.source.length > 0 ? extractAllEntityAttributes(store, id).find((a) => a.name === 'ElevationOfRefHeight')?.value : undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const units = store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty();
      return value * (units.unitForMeasure('IfcLengthMeasure')?.siScale ?? 1);
    }
  }
  return null;
}
