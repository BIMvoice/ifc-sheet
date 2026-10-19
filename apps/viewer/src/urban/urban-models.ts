/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `urbanIndicators`' input: one storey per
 * project level (a level spans the models that have it), its footprint from
 * the rendered meshes of what stands on it (`footprint.ts`), every room's
 * floor area, and the site area the model states. Reads the stores; the wasm
 * module must be initialised.
 *
 * - Rooms (IfcSpace): the area is NetFloorArea, else GrossFloorArea, from
 *   `Qto_SpaceBaseQuantities` first and then any quantity set (ArchiCAD
 *   writes them to `BaseQuantities`), in SI like the material takeoff. The
 *   category is the room's ObjectType, else its LongName, else its Name.
 * - Site area: the IfcSite's GrossArea quantity, when positive.
 */

import { extractAllEntityAttributes, extractProjectUnits, ProjectUnits, type IfcDataStore } from '@ifc-lite/parser';
import { QuantityType, type QuantitySet } from '@ifc-lite/data';
import { iterateEffectiveEntityIds } from '@ifc-lite/mutations';
import { createListDataProvider } from '@/lib/lists';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { storeyOfElement } from '@/project/effective-storey';
import { quantityScales } from '@/joinery/material-takeoff-models';
import { storeyFootprint, type PlanMesh } from './footprint';
import type { SpaceInput, StoreyInput } from './indicators';

/** What draws a storey's outline. */
const ENCLOSURE = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE', 'IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE', 'IFCCURTAINWALL']);
const AREA_NAMES = ['NetFloorArea', 'GrossFloorArea'];

export interface UrbanAreas {
  storeys: StoreyInput[];
  spaces: SpaceInput[];
  /** m² the model states for its site, or null. */
  modelSiteArea: number | null;
  /** Names of the levels whose holes were all taken as inside (walls, no slab or room). */
  assumedInterior: string[];
}

/** The first of `names` found, preferring the set named `preferred`; in SI. */
export function pickArea(qsets: readonly QuantitySet[], preferred: string, names: readonly string[], siScale: number): number | null {
  const ordered = [...qsets.filter((s) => s.name === preferred), ...qsets.filter((s) => s.name !== preferred)];
  for (const name of names) {
    for (const set of ordered) {
      const q = set.quantities.find((x) => x.name === name && x.type === QuantityType.Area && Number.isFinite(x.value));
      if (q) return q.value * siScale;
    }
  }
  return null;
}

function longName(store: IfcDataStore, id: number): string {
  const v = extractAllEntityAttributes(store, id).find((a) => a.name === 'LongName')?.value;
  return typeof v === 'string' ? v : '';
}

/** The SI scales of a model's quantities. */
const scalesOf = (store: IfcDataStore) => quantityScales(store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty());

/** The first positive IfcSite GrossArea among the visible models, m²; null when none states one. */
export function modelSiteArea(): number | null {
  const s = useViewerStore.getState();
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store || model.visible === false) continue;
    const view = s.mutationViews.get(modelId) ?? undefined;
    const provider = createListDataProvider(store, model.name, undefined, view);
    const scale = scalesOf(store).area;
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view ?? null, ['IFCSITE'])) {
      const area = pickArea(provider.getQuantitySets(id), 'Qto_SiteBaseQuantities', ['GrossArea'], scale);
      if (area !== null && area > 0) return area;
    }
  }
  return null;
}

export function collectUrbanAreas(): UrbanAreas {
  const s = useViewerStore.getState();
  const levels = useProjectStore.getState().levels;
  const buckets = levels.map(() => ({ enclosure: [] as PlanMesh[], floor: [] as PlanMesh[] }));
  const spaces: SpaceInput[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    const hierarchy = store?.spatialHierarchy;
    if (!store || !hierarchy || model.visible === false) continue;
    const offset = model.idOffset ?? 0;
    const view = s.mutationViews.get(modelId) ?? undefined;
    const provider = createListDataProvider(store, model.name, undefined, view);
    const levelOfStorey = new Map<number, number>();
    for (const storeyId of hierarchy.byStorey.keys()) {
      const gid = store.entities.getGlobalId(storeyId);
      const index = levels.findIndex((l) => l.storeyGlobalIds.includes(gid));
      if (index >= 0) levelOfStorey.set(storeyId, index);
    }
    const levelOf = (id: number): number | null => {
      const storey = storeyOfElement(modelId, id);
      return storey === null ? null : levelOfStorey.get(storey) ?? null;
    };
    for (const mesh of model.geometryResult?.meshes ?? []) {
      const id = mesh.expressId - offset;
      if (view?.isDeleted(id)) continue;
      const type = (mesh.ifcType ?? provider.getEntityTypeName(id)).toUpperCase();
      const floor = type === 'IFCSPACE' || (type === 'IFCSLAB' && provider.getEntityPredefinedType?.(id).replace(/\./g, '') !== 'ROOF');
      if (!floor && !ENCLOSURE.has(type)) continue;
      const level = levelOf(id);
      if (level !== null) buckets[level][floor ? 'floor' : 'enclosure'].push(mesh);
    }
    const scales = scalesOf(store);
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view ?? null, ['IFCSPACE'])) {
      const category = provider.getEntityObjectType(id) || longName(store, id) || provider.getEntityName(id) || `#${id}`;
      spaces.push({ storey: levelOf(id), category, area: pickArea(provider.getQuantitySets(id), 'Qto_SpaceBaseQuantities', AREA_NAMES, scales.area) });
    }
  }
  const assumedInterior: string[] = [];
  const storeys = levels.map((level, i) => {
    const footprint = storeyFootprint(buckets[i].enclosure, buckets[i].floor);
    if (footprint?.assumedInterior) assumedInterior.push(level.name);
    return { name: level.name, elevation: level.elevation, footprint: footprint?.shapes ?? null };
  });
  return { storeys, spaces, modelSiteArea: modelSiteArea(), assumedInterior };
}
