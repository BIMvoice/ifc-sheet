/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Model workspace knows about an element kind (charter #6232,
 * M2.5): the IFC class of its occurrences and of its type objects, and how a
 * material layer set sits on it. Plus the live reads the inspector and the
 * transaction's defaults need: an element's kind, type and layer set, the
 * types of a class, and the model's materials.
 *
 * Every read goes through the mutation overlay, so a type, material or
 * relationship authored this session counts, and a deleted one does not.
 */

import { liveEntityConforms, liveEntityConformsForRead, readRelatedLists, readRelatedListsForRead, fromNativeLength } from '@ifc-lite/create';
import { iterateEffectiveEntityIds, type IfcAttributeValue, type MutablePropertyView } from '@ifc-lite/mutations';
import { getAttributeNamesForSchema, getSchemaRegistryForVersion, type IfcDataStore } from '@ifc-lite/parser';
import { effectiveListStringAttribute } from '@/lib/lists/effective-provider-entities';
import { getModelLengthUnitScale } from '@/lib/length-unit-scale';
import type { AuthoredElementKind, AuthoringDefaults } from '@/store/slices/authoringDefaultsSlice';

export interface AuthoredKindInfo {
  /** The occurrence class, subtypes included (`IfcWallStandardCase` is a wall). */
  readonly occurrence: string;
  readonly type: string;
  /** How a layer set runs through it: across a wall, up through a slab. Absent: no layer sets. */
  readonly layers?: 'AXIS2' | 'AXIS3';
}

/** Checked in this order; the first class an element conforms to names its kind. */
export const AUTHORED_KINDS: Readonly<Record<AuthoredElementKind, AuthoredKindInfo>> = {
  wall: { occurrence: 'IfcWall', type: 'IfcWallType', layers: 'AXIS2' },
  slab: { occurrence: 'IfcSlab', type: 'IfcSlabType', layers: 'AXIS3' },
  roof: { occurrence: 'IfcRoof', type: 'IfcRoofType', layers: 'AXIS3' },
  plate: { occurrence: 'IfcPlate', type: 'IfcPlateType', layers: 'AXIS3' },
  column: { occurrence: 'IfcColumn', type: 'IfcColumnType' },
  beam: { occurrence: 'IfcBeam', type: 'IfcBeamType' },
  member: { occurrence: 'IfcMember', type: 'IfcMemberType' },
  door: { occurrence: 'IfcDoor', type: 'IfcDoorType' },
  window: { occurrence: 'IfcWindow', type: 'IfcWindowType' },
  space: { occurrence: 'IfcSpace', type: 'IfcSpaceType' },
};

const KINDS = Object.keys(AUTHORED_KINDS) as AuthoredElementKind[];

/**
 * The kind the running command builds next, for the inspector's defaults
 * mode. The Slab and Beam commands build the class picked in their bar
 * (`slabClass`: slab, roof or plate; `beamClass`: beam or member), so their
 * defaults are that class's.
 */
export function commandKind(
  commandId: string | null | undefined,
  defaults: Pick<AuthoringDefaults, 'slabClass' | 'beamClass'>,
): AuthoredElementKind | null {
  switch (commandId) {
    case 'wall.place': return 'wall';
    case 'slab.place': return defaults.slabClass;
    case 'column.place': return 'column';
    case 'beam.place': return defaults.beamClass;
    case 'room.place': return 'space';
    case 'door.place': return 'door';
    case 'window.place': return 'window';
    default: return null;
  }
}

export interface LiveModel {
  readonly dataStore: IfcDataStore;
  readonly view: MutablePropertyView | null | undefined;
  /**
   * The caller only READS the model (a drawing's materials): an IFCX model's classes and graph-derived relationships
   * are then answered instead of refused. Absent, the reads refuse an IFCX model as authoring does, which the
   * writers and the viewer's guards rely on.
   */
  readonly readOnly?: true;
}

export const liveConforms = (model: LiveModel, id: number, ifcClass: string): boolean =>
  (model.readOnly ? liveEntityConformsForRead : liveEntityConforms)(model.dataStore, id, ifcClass, model.view);

export const liveRelatedLists = (model: LiveModel, relType: 'IfcRelDefinesByType' | 'IfcRelAssociatesMaterial') =>
  (model.readOnly ? readRelatedListsForRead : readRelatedLists)(model.dataStore, relType, model.view);

export interface NamedEntity {
  readonly expressId: number;
  readonly name: string;
}

export function authoredKindOf({ dataStore, view }: LiveModel, expressId: number): AuthoredElementKind | null {
  return KINDS.find((kind) => liveEntityConforms(dataStore, expressId, AUTHORED_KINDS[kind].occurrence, view)) ?? null;
}

/**
 * The live `Name`. The entity table indexes names of IfcRoot entities only,
 * so for a file's IfcMaterial (not an IfcRoot) the source record's `Name`
 * slot is read instead.
 */
export function entityName({ dataStore, view }: LiveModel, expressId: number): string {
  return effectiveListStringAttribute(dataStore, view ?? undefined, expressId, 'Name', () => {
    const indexed = dataStore.entities.getName(expressId);
    if (indexed) return indexed;
    const entity = dataStore.getEntity(expressId);
    const slot = entity ? getAttributeNamesForSchema(entity.type, dataStore.schemaVersion).indexOf('Name') : -1;
    const value = slot < 0 ? undefined : entity?.attributes[slot];
    return typeof value === 'string' ? value : '';
  });
}

function named(model: LiveModel, ids: Iterable<number>): NamedEntity[] {
  return [...ids]
    .map((expressId) => ({ expressId, name: entityName(model, expressId) || `#${expressId}` }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.expressId - b.expressId);
}

function liveIdsOf(model: LiveModel, ifcClass: string): number[] {
  const { dataStore, view } = model;
  return Array.from(iterateEffectiveEntityIds(dataStore, view, [ifcClass.toUpperCase()]), (e) => e.expressId)
    .filter((id) => liveConforms(model, id, ifcClass));
}

const REGISTRY_VERSIONS = new Set(['IFC2X3', 'IFC4', 'IFC4X3']);

/**
 * Whether the model's schema has the kind's type class at all (decision D2:
 * IFC2X3 has no IfcDoorType or IfcWindowType, only the older styles, so a
 * door or window there keeps no type; an IFC5 model takes none).
 */
export function typeClassInSchema({ dataStore }: LiveModel, kind: AuthoredElementKind): boolean {
  const version = String(dataStore.schemaVersion ?? 'IFC4').toUpperCase();
  if (!REGISTRY_VERSIONS.has(version)) return false;
  const registry = getSchemaRegistryForVersion(version as Parameters<typeof getSchemaRegistryForVersion>[0]);
  const wanted = AUTHORED_KINDS[kind].type.toUpperCase();
  return Object.keys(registry.entities).some((name) => name.toUpperCase() === wanted);
}

/** The kind's type objects in the model, by name. Empty when the schema has no such class. */
export function typesOfKind(model: LiveModel, kind: AuthoredElementKind): NamedEntity[] {
  return named(model, liveIdsOf(model, AUTHORED_KINDS[kind].type));
}

export function materialsOf(model: LiveModel): NamedEntity[] {
  return named(model, liveIdsOf(model, 'IfcMaterial'));
}

type RelType = 'IfcRelDefinesByType' | 'IfcRelAssociatesMaterial';

function relatingOf(model: LiveModel, relType: RelType, expressId: number): number | null {
  return liveRelatedLists(model, relType).find((rel) => rel.relatedIds.includes(expressId))?.relatingId ?? null;
}

export function typeOf(model: LiveModel, expressId: number): number | null {
  return relatingOf(model, 'IfcRelDefinesByType', expressId);
}

/** `relatingOf` for every related object at once. Where one is in more than one relationship, the first wins, as in `relatingOf`. */
function relatingIndex(model: LiveModel, relType: RelType): Map<number, number | null> {
  const index = new Map<number, number | null>();
  for (const rel of liveRelatedLists(model, relType)) {
    for (const id of rel.relatedIds) if (!index.has(id)) index.set(id, rel.relatingId ?? null);
  }
  return index;
}

/**
 * `typeOf` for every typed occurrence at once: one read of the model's
 * IfcRelDefinesByType instead of one per element. A snapshot: rebuild it when
 * the overlay changes.
 */
export function typeIndex(model: LiveModel): Map<number, number | null> {
  return relatingIndex(model, 'IfcRelDefinesByType');
}

/** How `layerSetOf` finds an element's relationships. */
export interface RelationReads {
  relatingOf(relType: RelType, expressId: number): number | null;
}

/**
 * Relationship reads for a pass over many elements of one model (a drawing's
 * materials): each kind of relationship is read once, on first use, instead
 * of once per element. A snapshot: use it within one pass, while the overlay
 * cannot change.
 */
export function relationSnapshot(model: LiveModel): RelationReads {
  const built = new Map<RelType, Map<number, number | null>>();
  return {
    relatingOf(relType, expressId) {
      let index = built.get(relType);
      if (!index) built.set(relType, (index = relatingIndex(model, relType)));
      return index.get(expressId) ?? null;
    },
  };
}

/** The occurrences a type object types (IfcRelDefinesByType.RelatedObjects). */
export function occurrencesOf(model: LiveModel, typeId: number): number[] {
  return liveRelatedLists(model, 'IfcRelDefinesByType')
    .filter((rel) => rel.relatingId === typeId)
    .flatMap((rel) => rel.relatedIds);
}

function liveAttributes({ dataStore, view }: LiveModel, id: number): IfcAttributeValue[] | null {
  if (view?.isDeleted(id)) return null;
  const entity = view?.getNewEntity(id) ?? dataStore.getEntity(id);
  if (!entity) return null;
  const attrs = [...entity.attributes] as IfcAttributeValue[];
  for (const [index, value] of view?.getPositionalMutationsForEntity(id) ?? []) attrs[index] = value;
  return attrs;
}

function refId(value: IfcAttributeValue | undefined): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  const match = typeof value === 'string' ? /^#(\d+)$/.exec(value) : null;
  return match ? Number(match[1]) : null;
}

function real(value: IfcAttributeValue | undefined): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'real' in value) return Number(value.real);
  return Number.NaN;
}

export interface LayerRow {
  readonly materialId: number | null;
  /** Metres. */
  readonly thickness: number;
}

export interface LiveLayerSet {
  readonly layerSetId: number;
  readonly layers: readonly LayerRow[];
  /** Where the set is associated: on the element itself, or through its type. */
  readonly via: 'element' | 'type';
}

/** The layers of an IfcMaterialLayerSet, outermost first, in metres. */
export function readLayerSet(model: LiveModel, layerSetId: number): LayerRow[] | null {
  if (!liveConforms(model, layerSetId, 'IfcMaterialLayerSet')) return null;
  const refs = liveAttributes(model, layerSetId)?.[0];
  if (!Array.isArray(refs)) return null;
  const unit = { lengthUnitScale: getModelLengthUnitScale(model.dataStore) };
  return refs.map((ref) => {
    const layer = liveAttributes(model, refId(ref) ?? 0);
    return { materialId: refId(layer?.[0]), thickness: fromNativeLength(unit, real(layer?.[1])) };
  });
}

/** An associated IfcMaterialLayerSetUsage or IfcMaterialLayerSet, resolved to the set. */
export function layerSetBehind(model: LiveModel, materialId: number | null): number | null {
  if (materialId === null) return null;
  if (liveConforms(model, materialId, 'IfcMaterialLayerSetUsage')) {
    return refId(liveAttributes(model, materialId)?.[0]);
  }
  return liveConforms(model, materialId, 'IfcMaterialLayerSet') ? materialId : null;
}

/** The element's layer set: its own association first, then its type's. */
export function layerSetOf(
  model: LiveModel,
  expressId: number,
  relations: RelationReads = { relatingOf: (relType, id) => relatingOf(model, relType, id) },
): LiveLayerSet | null {
  const own = layerSetBehind(model, relations.relatingOf('IfcRelAssociatesMaterial', expressId));
  const typeId = own === null ? relations.relatingOf('IfcRelDefinesByType', expressId) : null;
  const inherited = typeId === null ? null : layerSetBehind(model, relations.relatingOf('IfcRelAssociatesMaterial', typeId));
  const layerSetId = own ?? inherited;
  const layers = layerSetId === null ? null : readLayerSet(model, layerSetId);
  return layerSetId === null || !layers ? null : { layerSetId, layers, via: own !== null ? 'element' : 'type' };
}
