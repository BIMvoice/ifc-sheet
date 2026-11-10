/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The models read into `type-quantities.ts`'s input (#581): every geometry-bearing physical element with its defining type, its
 * storey and its Qto quantities in SI, an area or volume the model does not state measured from the meshes (#74), and, when the
 * schedule shows a classification (#89), the code `classificationOf` gives. It reads only `ScheduleModel` (its list provider, its
 * meshes, its own classification references), so the app and `ifcsheet build --project` take the same elements from it.
 */

import { RelationshipType } from '@ifc-lite/data';
import { extractAllMaterialsOnDemand } from '@ifc-lite/parser';
import { boqScales, materialNamesOf } from './boq-read.js';
import { classificationOf, mappingsFor, type ClassificationMapping } from './classification.js';
import { modelClassification } from './classification-read.js';
import type { ScheduleModel } from './joinery-schedule.js';
import { createHeadlessListProvider } from './list-provider.js';
import { withMeasured } from './measured-quantities.js';
import { isPhysicalElement } from './readiness-read.js';
import { elementTypeQuantities, typeQuantities, type TypeElement, type TypeQuantities } from './type-quantities.js';
import type { ScheduleClassification } from './sub-reports.js';

/**
 * Every element is counted once: an element whose IfcRelAggregates parts are themselves listed (an IfcRoof with its own Body over
 * IfcSlab parts, an IfcStair over IfcStairFlight parts, an IfcCurtainWall over plates and members) is left out, and its parts are
 * counted. Parts are the side that carries the specific Qto (Qto_SlabBaseQuantities, ...), and the rule is the same whichever
 * parent class it is. With `classify`, each element carries its classification: the model's own reference, else the mapping.
 */
export function typeElementsOf(models: readonly ScheduleModel[], classify?: { mappings: readonly ClassificationMapping[] }): TypeElement[] {
  const out: TypeElement[] = [];
  for (const model of models) {
    const { modelId, dataStore: store } = model;
    const provider = model.listProvider?.() ?? createHeadlessListProvider(store, model.name ?? '');
    const references = classify ? (model.classification ?? (() => modelClassification(model)))() : undefined;
    const scales = boqScales(store);
    const hierarchy = store.spatialHierarchy;
    const listed = new Set((provider.getAllEntityIds?.() ?? []).filter((id) => isPhysicalElement(provider.getEntityTypeName(id))));
    for (const id of listed) {
      const className = provider.getEntityTypeName(id);
      if (store.relationships?.getRelated(id, RelationshipType.Aggregates, 'forward').some((part) => listed.has(part))) continue;
      const typeId = store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
      const typeName = typeId === undefined ? '' : provider.getEntityDefiningTypeName?.(id) ?? '';
      const storey = hierarchy?.elementToStorey.get(id);
      const materials = classify ? [...new Set(extractAllMaterialsOnDemand(store, id).flatMap(materialNamesOf))] : [];
      const declared = elementTypeQuantities(className, provider.getQuantitySets(id), scales);
      const q = withMeasured(declared, className, () => model.meshesOf?.(id));
      out.push({
        className,
        typeClass: typeId === undefined || !typeName ? null : provider.getEntityTypeName(typeId),
        typeName: typeName || null,
        level: provider.getStoreyName?.(id) ?? '',
        elevation: storey === undefined ? null : hierarchy?.storeyElevations.get(storey) ?? null,
        length: declared.length, area: q.area, volume: q.volume, areaSource: q.areaSource, volumeSource: q.volumeSource,
        ...(q.volumeRefusal ? { volumeRefusal: q.volumeRefusal } : {}),
        // The engine's one function (#89): the model's own reference, else the mapping (type, material, class).
        ...(classify && references ? { classification: classificationOf({ className, typeName: typeName || null, materials, modelId, expressId: id }, classify.mappings, references) } : {}),
      });
    }
  }
  return out;
}

/**
 * The quantities by type for a schedule's classification choice (#89): without one, the table as it always was; with one, a row per type
 * and code, the codes from the mapping the choice names (of the project's `mappings`) and the model's own references (which win), grouped
 * by code when asked. The one read of the sheet, the tab and the CSV and XLSX, in the app and in `ifcsheet build --project`.
 */
export function typeQuantitiesOver(models: readonly ScheduleModel[], mappings: readonly ClassificationMapping[] | undefined, choice?: ScheduleClassification): TypeQuantities {
  if (!choice) return typeQuantities(typeElementsOf(models));
  return typeQuantities(typeElementsOf(models, { mappings: mappingsFor(mappings, choice.mapping) }), { classified: true, group: choice.group === true });
}
