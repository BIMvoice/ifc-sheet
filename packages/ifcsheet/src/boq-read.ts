/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The models read into the elements the bill of quantities sums (#75). The loop is ONE function, `readBoqElements`, over a
 * `BoqSource`: the few reads that depend on how the models are held. `storeSource` answers them from a parsed model (the
 * command line, the checks); the web app starts from the same `storeSource` and replaces only the reads its edit overlay
 * changes (class, names, properties and quantities of an element edited in the session), so the two cannot read the models
 * differently: the parts that are not replaced are the same code.
 *
 * What counts as an element is the quantities-by-type rule: a physical element with geometry (not an opening or another feature of
 * an element, not virtual); an element whose IfcRelAggregates parts are themselves listed is left out and its parts are counted,
 * so nothing is counted twice. Quantities are the declared Qto values scaled to SI by the model's units.
 *
 * Its own entry with the headless chain: it loads the parser.
 */

import { QuantityType, RelationshipType, exactTypeName, type PropertySet, type QuantitySet } from '@ifc-lite/data';
import {
  ProjectUnits, extractAllMaterialsOnDemand, extractAllEntityAttributes, extractPropertiesOnDemand, extractProjectUnits, extractQuantitiesOnDemand,
  type IfcDataStore, type MaterialInfo,
} from '@ifc-lite/parser';
import type { BoqElement, BoqQuantity } from './boq-compute.js';
import { isPhysicalElement } from './readiness-read.js';
import { predefinedTypeText, propertyValueText, type PropertyFact } from './schedule-filter.js';

/** The reads `readBoqElements` makes of one model. */
export interface BoqSource {
  modelId: string;
  store: IfcDataStore;
  /** The candidates: every element with geometry. */
  ids(): Iterable<number>;
  className(id: number): string;
  /** The PredefinedType without dots, or null. */
  predefinedType(id: number): string | null;
  globalId(id: number): string;
  name(id: number): string;
  /** The defining type's Name; '' when the element has no type or the type has no name. */
  typeName(id: number): string;
  propertySets(id: number): readonly PropertySet[];
  quantitySets(id: number): readonly QuantitySet[];
}

/** The SI scales of a model's quantity units: a length, area, volume and mass unit in metres, square metres, cubic metres and kilograms. */
export interface BoqScales { length: number; area: number; volume: number; mass: number }

/** Scales from the units the model declares; an undeclared area or volume unit is the length unit squared or cubed, an undeclared mass unit is the kilogram. */
export function boqScales(store: IfcDataStore): BoqScales {
  const units = store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty();
  const length = units.unitForMeasure('IfcLengthMeasure')?.siScale ?? 1;
  return {
    length,
    area: units.resolvedForUnitType('AREAUNIT')?.siScale ?? length ** 2,
    volume: units.resolvedForUnitType('VOLUMEUNIT')?.siScale ?? length ** 3,
    mass: units.resolvedForUnitType('MASSUNIT')?.siScale ?? 1,
  };
}

const DIMENSION: Partial<Record<QuantityType, keyof BoqScales>> = {
  [QuantityType.Length]: 'length', [QuantityType.Area]: 'area', [QuantityType.Volume]: 'volume', [QuantityType.Weight]: 'mass',
};

/** The declared quantities of an element's sets in SI. Counts and times are not measures an article takes (`Count` is the element itself). A set named `Qto_...` comes before a custom one, so a name in both reads the standard set's. */
export function boqQuantities(sets: readonly QuantitySet[], scales: BoqScales): BoqQuantity[] {
  const out: BoqQuantity[] = [];
  const ordered = [...sets].sort((a, b) => Number(/^Qto_/.test(b.name)) - Number(/^Qto_/.test(a.name)));
  for (const set of ordered) {
    for (const q of set.quantities) {
      const dimension = DIMENSION[q.type];
      if (!dimension || !Number.isFinite(q.value)) continue;
      out.push({ name: q.name, dimension, value: q.value * scales[dimension] });
    }
  }
  return out;
}

/** Every material-name string one material association exposes: the material, its layers, constituents and profiles. */
export function materialNamesOf(info: MaterialInfo | null): string[] {
  if (!info) return [];
  const names: string[] = [];
  const push = (s: string | undefined) => { if (s) names.push(s); };
  push(info.name);
  for (const l of info.layers ?? []) { push(l.materialName); push(l.name); }
  for (const c of info.constituents ?? []) { push(c.materialName); push(c.name); }
  for (const p of info.profiles ?? []) { push(p.materialName); push(p.name); }
  for (const m of info.materials ?? []) push(m.name);
  return names;
}

/** An entity's PredefinedType read from the source (the columnar table has no accessor for it on a client parse); '' when it has none. */
function predefinedOf(store: IfcDataStore, id: number): string {
  if (!(store.source?.length > 0) || !store.entityIndex) return '';
  const entry = extractAllEntityAttributes(store, id).find((a) => a.name === 'PredefinedType');
  return entry ? String(entry.value).trim() : '';
}

/** The reads of a parsed model, no edit overlay. */
export function storeSource(modelId: string, store: IfcDataStore): BoqSource {
  const typeIdOf = (id: number): number | undefined => store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
  const onDemandProps = !!store.onDemandPropertyMap && store.source?.length > 0;
  const onDemandQtos = !!store.onDemandQuantityMap && store.source?.length > 0;
  return {
    modelId, store,
    ids: () => {
      const ids: number[] = [];
      const column = store.entities.expressId;
      for (let i = 0; i < column.length; i++) if (column[i] && store.entities.hasGeometry(column[i])) ids.push(column[i]);
      return ids;
    },
    className: (id) => exactTypeName(store.entities, id),
    predefinedType: (id) => predefinedTypeText(store.entities.getPredefinedType?.(id) || predefinedOf(store, id)),
    globalId: (id) => store.entities.getGlobalId(id),
    name: (id) => store.entities.getName(id),
    typeName: (id) => { const t = typeIdOf(id); return t === undefined ? '' : store.entities.getName(t) || ''; },
    propertySets: (id) => (onDemandProps ? (extractPropertiesOnDemand(store, id) as PropertySet[]) : store.properties?.getForEntity(id) ?? []),
    quantitySets: (id) => (onDemandQtos ? (extractQuantitiesOnDemand(store, id) as QuantitySet[]) : store.quantities?.getForEntity(id) ?? []),
  };
}

/** The properties of an element whose name is in `names` (lower case), as text. */
function propertyFacts(sets: readonly PropertySet[], names: ReadonlySet<string>): PropertyFact[] {
  const out: PropertyFact[] = [];
  for (const set of sets) {
    for (const p of set.properties) if (names.has(p.name.toLowerCase())) out.push({ pset: set.name, name: p.name, value: propertyValueText(p.value) ?? '' });
  }
  return out;
}

/**
 * The elements of one model for the sum. `propertyNames` (lower case) are the properties the articles' filters read; no others are taken.
 * Order: the model's own order of elements, so two reads of the same model are the same list.
 */
export function readBoqElements(source: BoqSource, propertyNames: ReadonlySet<string>): BoqElement[] {
  const { store } = source;
  const scales = boqScales(store);
  const hierarchy = store.spatialHierarchy;
  const listed = new Set([...source.ids()].filter((id) => isPhysicalElement(source.className(id))));
  const out: BoqElement[] = [];
  for (const id of listed) {
    // An element whose parts are listed is counted through them.
    if (store.relationships?.getRelated(id, RelationshipType.Aggregates, 'forward').some((part) => listed.has(part))) continue;
    const typeId = store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
    const typeName = typeId === undefined ? '' : source.typeName(id);
    const storey = hierarchy?.elementToStorey.get(id);
    out.push({
      modelId: source.modelId,
      expressId: id,
      globalId: source.globalId(id),
      name: source.name(id),
      ifcClass: source.className(id),
      predefinedType: source.predefinedType(id),
      typeClass: typeId === undefined || !typeName ? null : exactTypeName(store.entities, typeId),
      typeName: typeName || null,
      level: storey === undefined ? '' : store.entities.getName(storey) || '',
      materials: [...new Set(extractAllMaterialsOnDemand(store, id).flatMap(materialNamesOf))],
      properties: propertyNames.size > 0 ? propertyFacts(source.propertySets(id), propertyNames) : [],
      quantities: boqQuantities(source.quantitySets(id), scales),
    });
  }
  return out;
}
