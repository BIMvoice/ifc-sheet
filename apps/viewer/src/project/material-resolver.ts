/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The building materials of a view's drawing, read from the loaded models:
 * each cut band's IfcMaterial name (by its `materialId`, in the model its
 * element belongs to) and each element's layer order, resolved against the
 * project's materials table. Cached per drawing until the models or the
 * table change.
 */

import type { Drawing2D, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { extractAllMaterialsOnDemand } from '@ifc-lite/parser';
import { materialNamesOf } from '@/lib/lists/list-material-names';
import { useViewerStore } from '@/store';
import { layerSetOf } from '@/lib/commands/modeling/authored-kinds';
import { useProjectStore } from './project-store';
import { materialDrawing, type LayerRef, type MaterialDrawing } from './material-drawing';
import { MEMBRANE_THICKNESS_M, ifcMaterialName, materialGraphics } from './materials';

function modelOf(entityId: number) {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(entityId);
  const model = ref ? s.models.get(ref.modelId) : undefined;
  return ref && model?.ifcDataStore ? { ...ref, dataStore: model.ifcDataStore, view: s.mutationViews.get(ref.modelId) ?? null } : null;
}

function materialName(m: NonNullable<ReturnType<typeof modelOf>>, materialId: number): string | null {
  return ifcMaterialName(m.dataStore, m.view, materialId);
}

/** The distinct IfcMaterial names cut in a drawing (empty when there is none). */
export function drawingMaterialNames(drawing: Drawing2D | null): string[] {
  if (!drawing) return [];
  const names = new Map<string, string>();
  const seen = new Set<string>();
  for (const p of drawing.cutPolygons) {
    if (p.materialId === undefined) continue;
    const key = `${p.entityId}:${p.materialId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = modelOf(p.entityId);
    const name = m ? materialName(m, p.materialId) : null;
    if (name) names.set(name.trim().toLowerCase(), name);
  }
  return [...names.values()];
}

const cache = new WeakMap<Drawing2D, { key: string; value: MaterialDrawing }>();

/** The drawing's cut by building materials (null when nothing in it has a layered material). */
export function viewMaterials(drawing: Drawing2D | null): MaterialDrawing | null {
  if (!drawing || !drawing.cutPolygons.some((p) => p.materialId !== undefined)) return null;
  const table = useProjectStore.getState().materials ?? [];
  const key = `${useViewerStore.getState().mutationVersion}:${JSON.stringify(table)}`;
  const hit = cache.get(drawing);
  if (hit && hit.key === key) return hit.value;
  const value = materialDrawing(drawing, {
    graphics(p) {
      const m = modelOf(p.entityId);
      const name = m && p.materialId !== undefined ? materialName(m, p.materialId) : null;
      return name ? materialGraphics(name, table) : null;
    },
    layers(entityId) {
      const m = modelOf(entityId);
      const set = m ? layerSetOf({ dataStore: m.dataStore, view: m.view }, m.expressId) : null;
      if (!m || !set) return null;
      return set.layers.map((l): LayerRef => ({ materialId: l.materialId, name: (l.materialId !== null ? materialName(m, l.materialId) : null) ?? '', thickness: l.thickness }));
    },
    membrane: (layer) => layer.thickness < MEMBRANE_THICKNESS_M || (!!layer.name && !!materialGraphics(layer.name, table).membrane),
  });
  cache.set(drawing, { key, value });
  return value;
}

let elementCache: { version: number; byEntity: Map<number, string> } = { version: -1, byEntity: new Map() };

/**
 * What a cut face is made of, as a key: its band's IfcMaterial name, else its
 * element's material association(s). Like faces join only when this matches
 * (`cut-join-drawing.ts`). Read on demand once per element until the models change.
 */
export function cutMaterialKey(p: DrawingPolygon): string {
  const m = modelOf(p.entityId);
  if (!m) return '';
  if (p.materialId !== undefined) return (materialName(m, p.materialId) ?? '').trim().toLowerCase();
  const version = useViewerStore.getState().mutationVersion;
  if (elementCache.version !== version) elementCache = { version, byEntity: new Map() };
  const hit = elementCache.byEntity.get(p.entityId);
  if (hit !== undefined) return hit;
  let key = '';
  try {
    key = [...new Set(extractAllMaterialsOnDemand(m.dataStore, m.expressId).flatMap((info) => materialNamesOf(info)).map((n) => n.trim().toLowerCase()))].sort().join('|');
  } catch (err) {
    console.warn('[cut-join] could not read the material of an element', err);
  }
  elementCache.byEntity.set(p.entityId, key);
  return key;
}
