/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The fields a label can show for a picked element: only what the element
 * actually has, each with the placeholder text to put in the template and the
 * value it reads now. The picker lists these; nobody types a set name from memory.
 */

import { formatValue } from './label-format';
import { readField, type LabelElement } from './label-resolve';
import { ATTRIBUTE_FIELDS, fieldPath, type FieldRef } from './label-template';

export interface PickableField {
  /** What to insert in a template, braces included. */
  token: string;
  /** The label shown in the picker. */
  label: string;
  /** What the element reads there now. */
  sample: string;
}

export interface FieldGroup {
  id: 'element' | 'properties' | 'quantities' | 'type';
  /** The set name for property, quantity and type groups. */
  title: string | null;
  fields: PickableField[];
}

/** Characters a path cannot carry; a name with one has no token. */
const UNWRITABLE = /[.{}:|\\]/;

function tokenFor(ref: FieldRef, numeric: boolean): string {
  return `{${fieldPath(ref)}${numeric ? ':0.00' : ''}}`;
}

function field(ref: FieldRef, el: LabelElement, label: string, numeric = false): PickableField | null {
  const value = readField(ref, el);
  const sample = formatValue(value);
  return sample === null ? null : { token: tokenFor(ref, numeric && typeof value === 'number' && !Number.isInteger(value)), label, sample };
}

const nonNull = <T,>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);

export function listFields(el: LabelElement): FieldGroup[] {
  const groups: FieldGroup[] = [];
  const elementRefs: [FieldRef, string][] = [
    ...ATTRIBUTE_FIELDS.map((n): [FieldRef, string] => [{ kind: 'attribute', name: n }, n]),
    [{ kind: 'class', withPrefix: false }, 'Class'], [{ kind: 'class', withPrefix: true }, 'IfcClass'],
    [{ kind: 'typeName' }, 'Type.Name'], [{ kind: 'material' }, 'Material'], [{ kind: 'storey' }, 'Storey'],
  ];
  const element = nonNull(elementRefs.map(([ref, label]) => field(ref, el, label)));
  if (element.length) groups.push({ id: 'element', title: null, fields: element });
  const sets = (id: FieldGroup['id'], list: { name: string; items: string[] }[], make: (set: string, name: string) => PickableField | null) => {
    for (const set of list) {
      if (UNWRITABLE.test(set.name)) continue;
      const fields = nonNull(set.items.filter((n) => !UNWRITABLE.test(n)).map((n) => make(set.name, n)));
      if (fields.length) groups.push({ id, title: set.name, fields });
    }
  };
  const prop = (from: 'any' | 'type') => (set: string, name: string) => field({ kind: 'property', set, name, from }, el, name, true);
  sets('properties', el.propertySets().map((s) => ({ name: s.name, items: s.properties.map((p) => p.name) })), prop('any'));
  sets('quantities', el.quantitySets().map((s) => ({ name: s.name, items: s.quantities.map((q) => q.name) })), prop('any'));
  sets('type', [...el.typePropertySets().map((s) => ({ name: s.name, items: s.properties.map((p) => p.name) })),
    ...el.typeQuantitySets().map((s) => ({ name: s.name, items: s.quantities.map((q) => q.name) }))], prop('type'));
  return groups;
}
