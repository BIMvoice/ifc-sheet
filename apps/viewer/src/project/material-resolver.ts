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
import type { IfcDataStore } from '@ifc-lite/parser';
import { materialMakeupOf, meshMaterialName, pieceMaterialOf, type PieceNaming } from '@bimvoice/ifcsheet/material-colour';
import { useViewerStore } from '@/store';
import { layerSetOf, liveConforms, relationSnapshot, type LiveModel, type RelationReads } from '@/lib/commands/modeling/authored-kinds';
import { idOf } from '@/joinery/object-id';
import { useProjectStore } from './project-store';
import { materialDrawing, materialResolver, pieceNaming, type LayerRef, type MaterialDrawing } from '@bimvoice/ifcsheet/material-drawing';
import { ifcMaterialName } from './materials';

export function modelOf(entityId: number) {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(entityId);
  const model = ref ? s.models.get(ref.modelId) : undefined;
  return ref && model?.ifcDataStore ? { ...ref, dataStore: model.ifcDataStore, view: s.mutationViews.get(ref.modelId) ?? null, readOnly: true as const } : null;
}

function materialName(m: NonNullable<ReturnType<typeof modelOf>>, materialId: number): string | null {
  return ifcMaterialName(m.dataStore, m.view, materialId);
}

type ModelRef = NonNullable<ReturnType<typeof modelOf>>;

/**
 * The IfcMaterial an element cut in one piece is drawn by, for `naming` (the engine's `pieceMaterialOf`, which the headless sheets ask
 * too): its layer set read through the edit overlay, else the material associated with it directly, else a constituent set or a material
 * list as the engine reads it (the app edits neither).
 */
function pieceMaterialName(m: ModelRef, relations: RelationReads, naming: PieceNaming): string | null {
  if (naming === 'none') return null;
  const live: LiveModel = { dataStore: m.dataStore, view: m.view, readOnly: true };
  const set = layerSetOf(live, m.expressId, relations);
  if (set) {
    const layers = set.layers.map((l) => ({ name: l.materialId === null ? null : materialName(m, l.materialId), thickness: l.thickness, ventilated: l.ventilated }));
    return pieceMaterialOf({ kind: 'layers', layers }, naming);
  }
  const direct = relations.relatingOf('IfcRelAssociatesMaterial', m.expressId);
  if (direct !== null && liveConforms(m, direct, 'IfcMaterial')) return materialName(m, direct);
  const stored = materialMakeupOf(m.dataStore, m.expressId);
  return stored?.kind === 'constituents' || stored?.kind === 'list' ? pieceMaterialOf(stored, naming) : null;
}

/** The IfcMaterial a cut face is drawn by: its layer's, else that of an element cut in a single piece, for `naming` (`pieceNaming`). */
function polygonMaterialName(p: DrawingPolygon, naming: PieceNaming): string | null {
  const m = modelOf(p.entityId);
  if (!m) return null;
  if (p.materialId !== undefined) return materialName(m, p.materialId);
  return pieceMaterialName(m, relationsFor(m), naming);
}

const projectTable = () => useProjectStore.getState().materials ?? [];

/** The IfcMaterial a cut face is made of, table or not: what `styledDrawing` joins like cut faces by (#349), as the engine's `materialResolver(...).nameOf`. */
export const cutMaterialName = (p: DrawingPolygon): string | null => polygonMaterialName(p, pieceNaming(projectTable(), true));

/** The IfcMaterial a mesh is painted by (`meshMaterialName`, the engine's, which the headless sheets name it with too); null for one with none. */
export function meshMaterialOf(mesh: { expressId: number; materialId?: number }): string | null {
  const m = modelOf(mesh.expressId);
  return m ? meshMaterialName(m.dataStore, m.expressId, mesh.materialId) : null;
}

/** The distinct IfcMaterial names cut in a drawing (empty when there is none). */
export function drawingMaterialNames(drawing: Drawing2D | null): string[] {
  if (!drawing) return [];
  const naming = pieceNaming(projectTable(), false);
  const names = new Map<string, string>();
  const seen = new Set<string>();
  for (const p of drawing.cutPolygons) {
    const key = `${p.entityId}:${p.materialId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = polygonMaterialName(p, naming);
    if (name) names.set(name.trim().toLowerCase(), name);
  }
  return [...names.values()];
}

const cache = new WeakMap<Drawing2D, { key: string; value: MaterialDrawing }>();
/**
 * Each model's relationship snapshot, shared by every view's drawing while the model is unchanged.
 * Keyed by the data store itself and held weakly: the snapshot reads through that store, so a cache
 * keyed by anything that outlives it (a model id) would keep every unloaded model's data alive.
 */
const relationCache = new WeakMap<IfcDataStore, { key: string; reads: RelationReads }>();

/**
 * One read of each model's relationships for every drawing, not one per element (#154), until the
 * model changes: keyed on the mutation version, as the drawing cache is, and on the edit view's identity (a refresh swaps the view; a swapped store is a different cache key).
 */
function relationsFor(live: LiveModel): RelationReads {
  const stampKey = `${live.view ? idOf(live.view) : 0}:${useViewerStore.getState().mutationVersion}`;
  const held = relationCache.get(live.dataStore);
  if (held && held.key === stampKey) return held.reads;
  const reads = relationSnapshot(live);
  relationCache.set(live.dataStore, { key: stampKey, reads });
  return reads;
}

/**
 * The drawing's cut by building materials (null when nothing in it has a layered material, and the table has no rows to apply to
 * elements cut in one piece).
 */
export function viewMaterials(drawing: Drawing2D | null): MaterialDrawing | null {
  if (!drawing) return null;
  const table = useProjectStore.getState().materials ?? [];
  if (table.length === 0 && !drawing.cutPolygons.some((p) => p.materialId !== undefined)) return null;
  // The table is part of the key: an edit of a material draws every drawing again, whatever else is unchanged.
  const key = `${useViewerStore.getState().mutationVersion}:${JSON.stringify(table)}`;
  const hit = cache.get(drawing);
  if (hit && hit.key === key) return hit.value;
  const value = materialDrawing(drawing, materialResolver({
    nameOf: polygonMaterialName,
    layers(entityId) {
      const m = modelOf(entityId);
      if (!m) return null;
      const live: LiveModel = { dataStore: m.dataStore, view: m.view, readOnly: true };
      const set = layerSetOf(live, m.expressId, relationsFor(live));
      if (!m || !set) return null;
      return set.layers.map((l): LayerRef => ({ materialId: l.materialId, name: (l.materialId !== null ? materialName(m, l.materialId) : null) ?? '', thickness: l.thickness }));
    },
  }, table));
  cache.set(drawing, { key, value });
  return value;
}
