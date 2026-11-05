/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A terrain on a site plan as contours (#182) over the loaded geometry. The rule (marching triangles, which plans take
 * them, the pens) is the engine's (`withContours`, `contours.ts`), the one the headless sheets call; this module decides
 * which loaded meshes are terrain: a LandXML model's surfaces (they carry no class of their own, the model's source says
 * what they are) and any IfcGeographicElement.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { isTerrainMesh, withContours } from '@bimvoice/ifcsheet';
import type { ProjectView } from './types';

/** What of a loaded model the terrain is read from: its source semantics (present for LandXML) and its meshes. */
export interface TerrainSource { landXmlDocument?: object; geometryResult: Pick<GeometryResult, 'meshes'> | null }

/** The loaded meshes that are terrain: every mesh of a LandXML model, and the geographic elements of the rest. */
export function terrainMeshes(models: ReadonlyMap<string, TerrainSource>, runtime: readonly MeshData[] | undefined): MeshData[] {
  const out = new Set<MeshData>();
  for (const model of models.values()) {
    if (model.landXmlDocument) for (const mesh of model.geometryResult?.meshes ?? []) out.add(mesh);
  }
  for (const mesh of runtime ?? []) if (isTerrainMesh(mesh)) out.add(mesh);
  return [...out];
}

/** `drawing` with the terrain drawn as contours when `view` takes them (a site plan, or the plan of a model with no storeys); the same object otherwise. */
export function withViewContours<T extends Drawing2D>(
  drawing: T, view: ProjectView | undefined, models: ReadonlyMap<string, TerrainSource>, geometry: (Pick<GeometryResult, 'meshes'> & Partial<Pick<GeometryResult, 'coordinateInfo'>>) | null | undefined,
): T {
  if (view?.kind !== 'plan') return drawing;
  return withContours(drawing, view, terrainMeshes(models, geometry?.meshes), geometry?.coordinateInfo?.originShift?.y ?? 0);
}
