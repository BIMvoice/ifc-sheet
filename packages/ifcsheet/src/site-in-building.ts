/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The elements a model contains in its IfcSite or IfcBuilding instead of a storey, but that stand on the building's footprint:
 * they are part of the building, framed, cut and drawn with it (#557). Some exporters put part of the house there: Rhino's ASIFC
 * plug-in contains the bodies of 42 of ISSUE_034_HouseZ's 140 walls (from 0.9 m under the ground floor up to its ceiling), its
 * lower slabs, stairs and four doors in the IfcSite. Its storeys hold only the bands of those walls above 3.17 m, so the ground
 * plan drew them dashed, overhead, with a few wall stubs cut, and its elevations drew the ground floor windows floating in the
 * air.
 *
 * The footprint is the plan box of what the storeys contain (`storeyElementIds`, framed by `frameEntities` so a far stray cannot
 * widen it). An element joins when its plan box lies inside it: at any height, so a lower floor or a foundation the storeys do not
 * hold comes in, and it can make the frame deeper but never wider, so the paper and scale of a plan do not change. A garden
 * wall, a fence or a shed beside the house lies outside and stays the site around the building, as before; a terrain never joins
 * (`isTerrainPredefinedType`), nor a space. The engine (`openModel`) and the app (`buildingFraming`) both ask through
 * `buildingElementIds`, so they still frame on the same elements.
 */

import { IfcTypeEnum, isSpatialStructureType, type SpatialHierarchy } from '@ifc-lite/data';
import type { MeshData } from '@ifc-lite/geometry';
import { createEntityBoundsLookup, type BoundingBox3D } from './entity-bounds.js';
import { frameEntities } from './framing.js';
import { isTerrainPredefinedType } from './terrain.js';

/** How far, as a share of the footprint's longest side, an element may stand out of the footprint and still lie on it. */
export const SITE_IN_BUILDING_TOLERANCE = 0.01;

/** The plan axes of the viewer frame (Y is up). */
const PLAN = ['x', 'z'] as const;

/** Whether `box` lies on `footprint` in plan, `slack` metres of it allowed out on each side. */
function onFootprint(box: BoundingBox3D, footprint: BoundingBox3D, slack: number): boolean {
  return PLAN.every((k) => box.min[k] >= footprint.min[k] - slack && box.max[k] <= footprint.max[k] + slack);
}

/** The meshes of one model and the offset its express ids carry in them (federation; 0 for one model). */
export interface BuildingGeometry {
  meshes: MeshData[] | null;
  idOffset?: number;
}

/**
 * The express ids of the elements a site or a building of `hierarchy` contains (directly, or as aggregated parts of what it
 * contains) rather than a storey, whose meshes lie on the footprint of `storeyIds`, the elements the storeys hold. Empty when
 * those have no geometry.
 */
export function siteElementsInBuilding(
  hierarchy: Pick<SpatialHierarchy, 'bySite' | 'byBuilding' | 'elementToStorey'> & Partial<Pick<SpatialHierarchy, 'elementToContainer'>>,
  storeyIds: readonly number[],
  geometry: BuildingGeometry,
  typeOf: (expressId: number) => IfcTypeEnum,
  /** The PredefinedType of an element (null: none); a geographic element that states none is a terrain. */
  predefinedTypeOf: (expressId: number) => string | null = () => null,
): number[] {
  const containers = new Set([...hierarchy.bySite.keys(), ...hierarchy.byBuilding.keys()]);
  const candidates = new Set<number>([...hierarchy.bySite.values(), ...hierarchy.byBuilding.values()].flat());
  for (const [id, container] of hierarchy.elementToContainer ?? []) if (containers.has(container)) candidates.add(id);
  const wanted = [...candidates].filter((id) => {
    if (hierarchy.elementToStorey.has(id)) return false;
    const type = typeOf(id);
    if (type === IfcTypeEnum.IfcSpace || isSpatialStructureType(type)) return false;
    return type !== IfcTypeEnum.IfcGeographicElement || !isTerrainPredefinedType(predefinedTypeOf(id));
  });
  if (wanted.length === 0 || !geometry.meshes) return [];
  const offset = geometry.idOffset ?? 0;
  const footprint = frameEntities(geometry.meshes, storeyIds.map((id) => id + offset)).extent;
  if (!footprint) return [];
  const slack = SITE_IN_BUILDING_TOLERANCE * Math.max(...PLAN.map((k) => footprint.max[k] - footprint.min[k]));
  const boundsOf = createEntityBoundsLookup(geometry.meshes, wanted.length);
  return wanted.filter((id) => {
    const box = boundsOf(id + offset);
    return box !== null && onFootprint(box, footprint, slack);
  });
}
