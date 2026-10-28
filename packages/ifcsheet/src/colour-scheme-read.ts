/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The value of a colour scheme's property on an element of a model opened without the app (#92), for the headless sheets. The app
 * reads the same paths through its label reader (`project/view-colour-scheme.ts`, `labels/label-resolve.ts`); here: an attribute
 * (`Name`, `LongName`, `Tag`, `ObjectType`, `Description`, `PredefinedType`, `GlobalId`), `Class`, `Pset.Property` on the element and,
 * where it has none, on its type, and `Type.Pset.Property`. The paths only the app can resolve (`Material`, `Storey`, `Type.Name`,
 * the tag fields `Mark` and `TagName`, quantities) read as no value here, so a view coloured by one of them is not coloured headlessly.
 */

import { getAttributeNamesForSchema } from '@ifc-lite/parser';
import { attributes, propertySetsOf, typeIndex, type Live } from './joinery-schedule.js';

const ATTRIBUTES = new Map(['Name', 'LongName', 'Tag', 'ObjectType', 'Description', 'PredefinedType', 'GlobalId'].map((n) => [n.toLowerCase(), n]));
const same = (a: string, b: string): boolean => a === b || a.toLowerCase() === b.toLowerCase();

type Reader = (expressId: number) => unknown;

/** A reader of `property` over `live`, or `null` when the path is not one this reader resolves. */
export function propertyValueReader(live: Live, property: string): Reader | null {
  const parts = property.split('.').map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => p === '')) return null;
  const { dataStore } = live;
  if (parts.length === 1) {
    const lower = parts[0].toLowerCase();
    if (lower === 'class' || lower === 'ifcclass') {
      return (id) => {
        const type = dataStore.entities.getTypeName(id);
        return lower === 'class' ? type.replace(/^Ifc/i, '') : type;
      };
    }
    const name = ATTRIBUTES.get(lower);
    if (!name) return null;
    return (id) => {
      const entity = dataStore.getEntity(id);
      const slot = entity ? getAttributeNamesForSchema(entity.type, dataStore.schemaVersion).indexOf(name) : -1;
      const value = slot < 0 ? undefined : attributes(live, id)?.[slot];
      return typeof value === 'string' ? value.replace(/^\.|\.$/g, '') : undefined;
    };
  }
  const fromType = parts[0].toLowerCase() === 'type';
  if (fromType ? parts.length !== 3 : parts.length !== 2) return null;
  const [set, name] = fromType ? [parts[1], parts[2]] : [parts[0], parts[1]];
  let types: Map<number, number | null> | undefined;
  const read = (id: number): unknown => {
    const sets = propertySetsOf(live, id);
    const found = sets.find((s) => s.name === set) ?? sets.find((s) => same(s.name, set));
    const p = found?.properties.find((q) => q.name === name) ?? found?.properties.find((q) => same(q.name, name));
    return p?.value;
  };
  const present = (v: unknown): boolean => v !== undefined && v !== null && v !== '';
  return (id) => {
    const own = fromType ? undefined : read(id);
    if (present(own)) return own;
    types ??= typeIndex(live);
    const typeId = types.get(id) ?? null;
    return typeId === null ? undefined : read(typeId);
  };
}
