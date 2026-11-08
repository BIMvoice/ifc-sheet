/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Writes back what an IFCX file said with `inherits`, which the reader turns into rows and relationships of its own
 * (#184, `packages/ifcx/src/definitions.ts`): a material node that elements inherit as `material`, and a type node that
 * occurrences inherit as `<class>Type` (a window's `windowType`).
 *
 * The exporter writes the file's own classes and skips those derived rows, so without this the material of every
 * element and the type of every window were gone after load, export and load again. Nothing is invented here: every
 * node and edge written is one the reader derived from the same node and edge.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import { RelationshipType } from '@ifc-lite/data';
import { writePsetProperties, type PsetPropertySinks } from './ifc5-pset-properties.js';

interface OutNode {
  path: string;
  children?: Record<string, string | null>;
  inherits?: Record<string, string | null>;
  attributes?: Record<string, unknown>;
}

const MATERIAL_ATTR = 'bsi::ifc::material';
const CLASS_ATTR = 'bsi::ifc::class';

/** The edge name `definitions.ts` reads as "typed by" for an occurrence of `className` (`IfcWindow` gives `windowType`). */
const typeEdgeName = (className: string): string => `${className[3].toLowerCase()}${className.slice(4)}Type`;

const classOf = (node: OutNode | undefined): string | undefined => (node?.attributes?.[CLASS_ATTR] as { code?: string } | undefined)?.code;

/** The value of the property `name` the reader unpacked from a derived node (`Material` and `Uri` of `bsi::ifc::material`). */
function propertyOf(store: IfcDataStore, expressId: number, name: string): string | undefined {
  for (const set of store.properties.getForEntity(expressId)) {
    const hit = set.properties.find((property) => property.name === name);
    if (typeof hit?.value === 'string') return hit.value;
  }
  return undefined;
}

/**
 * Adds the `inherits` edges to `nodes` in place and returns the material nodes to append. A material is written, with the
 * properties the file gave it, only with the whole entity set (`definitions` set), as the default export drops materials; an edge is written only
 * between nodes that were written. Several materials on one element (the parts of a window type) each hang on a
 * class-less carrier child of the element, as the source does.
 */
export function writeDerivedEdges(
  store: IfcDataStore,
  nodes: OutNode[],
  pathOf: ReadonlyMap<number, string>,
  definitions: { onlyKnownProperties: boolean; sinks: PsetPropertySinks } | null,
): OutNode[] {
  const derived = store.derivedEntities;
  if (!derived) return [];
  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const extra: OutNode[] = [];

  for (const typeId of derived.retyped.keys()) {
    const typePath = pathOf.get(typeId);
    if (!typePath || !byPath.has(typePath)) continue;
    for (const objectId of store.relationships.getRelated(typeId, RelationshipType.DefinesByType, 'forward')) {
      const node = byPath.get(pathOf.get(objectId) ?? '');
      const className = classOf(node);
      if (node && className?.startsWith('Ifc') && className.length > 3) node.inherits = { ...node.inherits, [typeEdgeName(className)]: typePath };
    }
  }

  if (!definitions) return extra;
  for (const materialId of derived.added) {
    // A derived row has no entry in `pathOf` (it is not exported as an entity); the reader gave it the node's path as GlobalId.
    const materialPath = store.entities.getGlobalId(materialId) || undefined;
    const code = propertyOf(store, materialId, 'Material');
    if (!materialPath || code === undefined) continue;
    const owners = store.relationships.getRelated(materialId, RelationshipType.AssociatesMaterial, 'forward')
      .map((id) => byPath.get(pathOf.get(id) ?? ''))
      .filter((node): node is OutNode => node !== undefined);
    if (owners.length === 0) continue;
    const attributes: Record<string, unknown> = { [MATERIAL_ATTR]: { code, uri: propertyOf(store, materialId, 'Uri') ?? '' } };
    // The material's own properties (StrengthClass, MassDensity...), without the `Material` pset that restates the attribute above.
    const own = store.properties.getForEntity(materialId).filter((set) => set.name !== 'Material');
    writePsetProperties(attributes, materialId, own, definitions.onlyKnownProperties, definitions.sinks);
    extra.push({ path: materialPath, attributes });
    for (const owner of owners) {
      const carrier = `${owner.path}/material/${materialPath}`;
      owner.children = { ...owner.children, [`material ${code}`]: carrier };
      extra.push({ path: carrier, inherits: { material: materialPath } });
    }
  }
  return extra;
}
