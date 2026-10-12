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
  /** `length`: the value is a length in the model's length unit (the other quantities are read as stored). */
  quantities: { name: string; value?: unknown; length?: boolean }[];
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
  /** Metres in one model length unit (0.001 for a model in millimetres). */
  lengthUnitScale(): number;
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

function quantityOf(sets: readonly QuantitySetLike[], set: string, name: string, scale: number): { value: unknown; length: boolean } | undefined {
  const found = findIn(sets, set)?.quantities;
  const q = found?.find((x) => x.name === name) ?? found?.find((x) => sameName(x.name, name));
  if (!q) return undefined;
  // A length is read in metres whatever unit the model is in; a unit written after the pattern converts it.
  return q.length && typeof q.value === 'number' ? { value: q.value * scale, length: true } : { value: q.value, length: false };
}

const present = (v: unknown): boolean => v !== null && v !== undefined && v !== '';

export interface FieldValue {
  value: unknown;
  /** The value is a length, in metres. */
  length: boolean;
}

const plain = (value: unknown): FieldValue => ({ value, length: false });

/** What a reference reads: the raw value (`undefined` when the element has none) and whether it is a length. */
export function readFieldValue(ref: FieldRef, el: LabelElement): FieldValue {
  switch (ref.kind) {
    case 'attribute': return plain(el.attribute(ref.name) || undefined);
    case 'class': return plain(el.className() ? (ref.withPrefix ? el.className() : el.className().replace(/^Ifc/i, '')) : undefined);
    case 'typeName': return plain(el.typeName() || undefined);
    case 'material': return plain(el.materials().join(' / ') || undefined);
    case 'storey': return plain(el.storey() || undefined);
    case 'property': {
      const scale = el.lengthUnitScale();
      const type = [plain(propertyOf(el.typePropertySets(), ref.set, ref.name)), quantityOf(el.typeQuantitySets(), ref.set, ref.name, scale)];
      const own = [plain(propertyOf(el.propertySets(), ref.set, ref.name)), quantityOf(el.quantitySets(), ref.set, ref.name, scale)];
      return [...(ref.from === 'type' ? [] : own), ...type].find((v): v is FieldValue => v !== undefined && present(v.value)) ?? plain(undefined);
    }
  }
}

/** The value a reference reads (see {@link readFieldValue}). */
export const readField = (ref: FieldRef, el: LabelElement): unknown => readFieldValue(ref, el).value;

const LENGTH_UNITS: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000 };

function readFormatted(field: TemplateField, el: LabelElement): string | null {
  const { value, length } = readFieldValue(field.ref, el);
  const factor = length && field.format ? LENGTH_UNITS[field.format.unit] : undefined;
  return formatValue(factor !== undefined && typeof value === 'number' ? value / factor : value, field.format);
}

function placeholder(field: TemplateField, missing: MissingMode): string {
  if (field.fallback !== undefined) return field.fallback;
  return missing === 'question' ? '?' : missing === 'field' ? field.source : '';
}

export function resolveTemplate(template: ParsedTemplate, el: LabelElement, missing: MissingMode = 'question'): string {
  return template.segments.map((s) => {
    if (s.type === 'text') return s.text;
    return readFormatted(s, el) ?? placeholder(s, missing);
  }).join('');
}
