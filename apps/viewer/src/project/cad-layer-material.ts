/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material a drawn element is matched on by the CAD layer standard
 * (`cad-layers.ts`), read from the loaded models:
 * - a cut band (`materialId` given): that IfcMaterial's name;
 * - an element associated with one IfcMaterial: its name;
 * - an element with a layer set: the material of its thickest layer;
 * the association is the element's own, else its type's. Constituent sets and
 * material lists are not read: such elements match on class only.
 *
 * Built once per model and edit (the association lists are scanned once, not
 * per element), and only when the project has CAD layer rules.
 */

import { liveEntityConforms, readRelatedLists } from '@ifc-lite/create';
import type { IfcDataStore } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { layerSetBehind, readLayerSet, type LiveModel } from '@/lib/commands/modeling/authored-kinds';
import type { CadPenContext } from '@/components/viewer/sheets/viewport-pens';
import { modelOf } from './material-resolver';
import { ifcMaterialName } from './materials';
import type { CadLayerRule } from './cad-layers';

interface Tables { version: number; assoc: Map<number, number>; byType: Map<number, number>; names: Map<number, string | null> }

const cache = new WeakMap<IfcDataStore, Tables>();

function tablesOf(model: LiveModel): Tables {
  const version = useViewerStore.getState().mutationVersion;
  const hit = cache.get(model.dataStore);
  if (hit && hit.version === version) return hit;
  const byRelated = (rel: 'IfcRelAssociatesMaterial' | 'IfcRelDefinesByType') => new Map(
    readRelatedLists(model.dataStore, rel, model.view).flatMap((r) => (r.relatingId === undefined ? [] : r.relatedIds.map((id) => [id, r.relatingId as number] as const))),
  );
  const fresh: Tables = { version, assoc: byRelated('IfcRelAssociatesMaterial'), byType: byRelated('IfcRelDefinesByType'), names: new Map() };
  cache.set(model.dataStore, fresh);
  return fresh;
}

function elementMaterial(model: LiveModel, expressId: number): string | null {
  const t = tablesOf(model);
  const typeId = t.byType.get(expressId);
  const relating = t.assoc.get(expressId) ?? (typeId === undefined ? undefined : t.assoc.get(typeId));
  if (relating === undefined) return null;
  if (liveEntityConforms(model.dataStore, relating, 'IfcMaterial', model.view)) return ifcMaterialName(model.dataStore, model.view, relating);
  const setId = layerSetBehind(model, relating);
  const layers = setId === null ? null : readLayerSet(model, setId);
  const main = layers?.filter((l) => l.materialId !== null).reduce<{ materialId: number | null; thickness: number } | null>((best, l) => (!best || l.thickness > best.thickness ? l : best), null);
  return main?.materialId == null ? null : ifcMaterialName(model.dataStore, model.view, main.materialId);
}

/** The CAD layer standard's view of the loaded models, or undefined when there are no rules (pens stay unsplit). */
export function cadPenContext(rules: readonly CadLayerRule[] | undefined): CadPenContext | undefined {
  if (!rules?.length) return undefined;
  return {
    materialOf(entityId, materialId) {
      const m = modelOf(entityId);
      if (!m) return null;
      if (materialId !== undefined) return ifcMaterialName(m.dataStore, m.view, materialId);
      const t = tablesOf(m);
      if (!t.names.has(entityId)) t.names.set(entityId, elementMaterial(m, m.expressId));
      return t.names.get(entityId) ?? null;
    },
  };
}
