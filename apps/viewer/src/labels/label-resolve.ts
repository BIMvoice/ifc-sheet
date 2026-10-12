/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The text of a label for one element: every field of the template read from
 * the element (`LabelElement`) and formatted, the literal text around it kept.
 * Pure: the viewer's data comes in through the interface (`label-element.ts`).
 */

import { formatValue } from './label-format';
import type { AttributeField, FieldRef, ParsedTemplate, TemplateField } from './label-template';

export interface PropertySetLike {
  name: string;
  properties: { name: string; value?: unknown }[];
}
export interface QuantitySetLike {
  name: string;
  quantities: { name: string; value?: unknown }[];
}

/** What a label can read of a model element. */
export interface LabelElement {
  attribute(name: AttributeField): string;
  /** The IFC class as declared, `IfcWall`. */
  className(): string;
  /** Name of the element's type object, '' without one. */
  typeName(): string;
  propertySets(): PropertySetLike[];
  quantitySets(): QuantitySetLike[];
  typePropertySets(): PropertySetLike[];
  typeQuantitySets(): QuantitySetLike[];
  materials(): string[];
  storey(): string;
}

/** What shows where a field has no value: nothing, a question mark, or the field's own path. */
export const MISSING_MODES = ['empty', 'question', 'field'] as const;
export type MissingMode = (typeof MISSING_MODES)[number];

const sameName = (a: string, b: string): boolean => a === b || a.toLowerCase() === b.toLowerCase();

function findIn<T extends { name: string }>(sets: readonly (T & { name: string })[], set: string): T | undefined {
  return sets.find((s) => s.name === set) ?? sets.find((s) => sameName(s.name, set));
}

function propertyOf(sets: readonly PropertySetLike[], set: string, name: string): unknown {
  const found = findIn(sets, set)?.properties;
  return (found?.find((p) => p.name === name) ?? found?.find((p) => sameName(p.name, name)))?.value;
}

function quantityOf(sets: readonly QuantitySetLike[], set: string, name: string): unknown {
  const found = findIn(sets, set)?.quantities;
  return (found?.find((q) => q.name === name) ?? found?.find((q) => sameName(q.name, name)))?.value;
}

const present = (v: unknown): boolean => v !== null && v !== undefined && v !== '';

/** The raw value a reference reads, `undefined` when the element has none. */
export function readField(ref: FieldRef, el: LabelElement): unknown {
  switch (ref.kind) {
    case 'attribute': return el.attribute(ref.name) || undefined;
    case 'class': return el.className() ? (ref.withPrefix ? el.className() : el.className().replace(/^Ifc/i, '')) : undefined;
    case 'typeName': return el.typeName() || undefined;
    case 'material': return el.materials().join(' / ') || undefined;
    case 'storey': return el.storey() || undefined;
    case 'property': {
      const type = [propertyOf(el.typePropertySets(), ref.set, ref.name), quantityOf(el.typeQuantitySets(), ref.set, ref.name)];
      if (ref.from === 'type') return type.find(present);
      const own = [propertyOf(el.propertySets(), ref.set, ref.name), quantityOf(el.quantitySets(), ref.set, ref.name)];
      return [...own, ...type].find(present);
    }
  }
}

function placeholder(field: TemplateField, missing: MissingMode): string {
  if (field.fallback !== undefined) return field.fallback;
  return missing === 'question' ? '?' : missing === 'field' ? field.source : '';
}

export function resolveTemplate(template: ParsedTemplate, el: LabelElement, missing: MissingMode = 'question'): string {
  return template.segments.map((s) => {
    if (s.type === 'text') return s.text;
    return formatValue(readField(s.ref, el), s.format) ?? placeholder(s, missing);
  }).join('');
}
