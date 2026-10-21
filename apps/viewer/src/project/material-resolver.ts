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

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { layerSetOf, relationSnapshot, type LiveModel, type RelationReads } from '@/lib/commands/modeling/authored-kinds';
import { idOf } from '@/joinery/object-id';
import { useProjectStore } from './project-store';
import { materialDrawing, type LayerRef, type MaterialDrawing } from './material-drawing';
import { MEMBRANE_THICKNESS_M, ifcMaterialName, materialGraphics } from './materials';

export function modelOf(entityId: number) {
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
/** Each model's relationship snapshot, shared by every view's drawing while the model is unchanged. */
const relationCache = new Map<string, { key: string; reads: RelationReads }>();

/**
 * One read of each model's relationships for every drawing, not one per element (#154), until the
 * model changes: keyed on the mutation version, as the drawing cache is, and on the data store's and
 * the edit view's identity (a collab refresh swaps the store under the same model id).
 */
function relationsFor(modelId: string, live: LiveModel): RelationReads {
  const stampKey = `${idOf(live.dataStore)}:${live.view ? idOf(live.view) : 0}:${useViewerStore.getState().mutationVersion}`;
  const held = relationCache.get(modelId);
  if (held && held.key === stampKey) return held.reads;
  const reads = relationSnapshot(live);
  relationCache.set(modelId, { key: stampKey, reads });
  return reads;
}

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
      if (!m) return null;
      const live = { dataStore: m.dataStore, view: m.view };
      const set = layerSetOf(live, m.expressId, relationsFor(m.modelId, live));
      if (!m || !set) return null;
      return set.layers.map((l): LayerRef => ({ materialId: l.materialId, name: (l.materialId !== null ? materialName(m, l.materialId) : null) ?? '', thickness: l.thickness }));
    },
    membrane: (layer) => layer.thickness < MEMBRANE_THICKNESS_M || (!!layer.name && !!materialGraphics(layer.name, table).membrane),
  });
  cache.set(drawing, { key, value });
  return value;
}
