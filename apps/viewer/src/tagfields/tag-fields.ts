/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which IFC property feeds each field of a tag. Per tag kind (door, window,
 * room, wall, any other element) and field (mark, name) the office lists
 * sources in order, and the first that has a value wins. A kind or field the
 * office has not configured reads the default, which is what tags showed
 * before the sources could be changed.
 *
 * Pure: values come in through `read`, which is the label reader
 * (`labels/label-resolve.ts`), so a source reads exactly like the same path in
 * a label template. Tags read these fields through the `Mark` and `TagName`
 * placeholders; formatting stays with the label that shows them.
 */

import type { AttributeField, FieldRef } from '@/labels/label-template';
import type { FieldValue } from '@/labels/label-resolve';

export const TAG_KINDS = ['door', 'window', 'room', 'wall', 'other'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const TAG_FIELD_IDS = ['mark', 'name'] as const;
export type TagFieldId = (typeof TAG_FIELD_IDS)[number];

/** The label placeholders that read a tag field. */
export const TAG_FIELD_ATTRIBUTES = { Mark: 'mark', TagName: 'name' } as const satisfies Partial<Record<AttributeField, TagFieldId>>;

/** What a source can be: an attribute the element carries, a property of a set, a quantity of a set, a property of the element's type. */
export type TagSource =
  | { kind: 'attribute'; name: AttributeField }
  | { kind: 'pset'; pset: string; property: string }
  | { kind: 'quantity'; qto: string; name: string }
  | { kind: 'type-pset'; pset: string; property: string };

export type TagFieldConfig = Partial<Record<TagKind, Partial<Record<TagFieldId, TagSource[]>>>>;

/** The attributes a source can name: the placeholders that read a tag field are themselves answers, never sources. */
export const SOURCE_ATTRIBUTES: readonly AttributeField[] = ['Mark', 'Name', 'LongName', 'Tag', 'ObjectType', 'Description', 'PredefinedType', 'GlobalId'];

const attr = (name: AttributeField): TagSource => ({ kind: 'attribute', name });

/** What a tag showed before the sources could be changed: the Tag when it is a mark; the name, a room's long name first. */
export function defaultSources(kind: TagKind, field: TagFieldId): TagSource[] {
  if (field === 'mark') return [attr('Mark')];
  return kind === 'room' ? [attr('LongName'), attr('Name')] : [attr('Name')];
}

/** The sources a field reads: the office's list, else the default. An empty list is an answer too: the field reads nothing. */
export function sourcesOf(config: TagFieldConfig | undefined, kind: TagKind, field: TagFieldId): TagSource[] {
  return config?.[kind]?.[field] ?? defaultSources(kind, field);
}

/** The tag kind of an IFC class (`IfcDoorStandardCase` is a door). */
export function tagKindOf(className: string): TagKind {
  if (/^ifcdoor/i.test(className)) return 'door';
  if (/^ifcwindow/i.test(className)) return 'window';
  if (/^ifcspace/i.test(className)) return 'room';
  if (/^ifcwall/i.test(className)) return 'wall';
  return 'other';
}

/** The reference a source reads through the label reader. */
export function sourceRef(s: TagSource): FieldRef {
  switch (s.kind) {
    case 'attribute': return { kind: 'attribute', name: s.name };
    case 'pset': return { kind: 'property', set: s.pset, name: s.property, from: 'any' };
    case 'quantity': return { kind: 'property', set: s.qto, name: s.name, from: 'any' };
    case 'type-pset': return { kind: 'property', set: s.pset, name: s.property, from: 'type' };
  }
}

const present = (v: unknown): boolean => v !== null && v !== undefined && v !== '';

/** The first source that has a value; a value-less field reads `undefined`. `read` reads one reference of the element, as stored. */
export function resolveTagField(config: TagFieldConfig | undefined, kind: TagKind, field: TagFieldId, read: (ref: FieldRef) => FieldValue): FieldValue {
  for (const source of sourcesOf(config, kind, field)) {
    const v = read(sourceRef(source));
    if (present(v.value)) return v;
  }
  return { value: undefined, length: false };
}

/** The text of a source as the person reads it: `Pset_DoorCommon.Reference`, `Tag`, `Type: Pset.Prop`. */
export function sourceText(s: TagSource): string {
  switch (s.kind) {
    case 'attribute': return s.name;
    case 'pset': return `${s.pset}.${s.property}`;
    case 'quantity': return `${s.qto}.${s.name}`;
    case 'type-pset': return `${s.pset}.${s.property}`;
  }
}

export const sameSource = (a: TagSource, b: TagSource): boolean => a.kind === b.kind && sourceText(a) === sourceText(b);

/** `config` with the sources of one field set; setting the default removes the entry, so a configuration holds only what differs. */
export function withSources(config: TagFieldConfig | undefined, kind: TagKind, field: TagFieldId, sources: readonly TagSource[]): TagFieldConfig | undefined {
  const dflt = defaultSources(kind, field);
  const same = sources.length === dflt.length && sources.every((s, i) => sameSource(s, dflt[i]));
  const fields = { ...config?.[kind] };
  if (same) delete fields[field];
  else fields[field] = [...sources];
  const next: TagFieldConfig = { ...config };
  if (Object.keys(fields).length) next[kind] = fields;
  else delete next[kind];
  return Object.keys(next).length ? next : undefined;
}

/** Whether the field's sources differ from the default. */
export const isCustom = (config: TagFieldConfig | undefined, kind: TagKind, field: TagFieldId): boolean => config?.[kind]?.[field] !== undefined;

/** How many fields of how many kinds the configuration sets. */
export function configuredFields(config: TagFieldConfig | undefined): number {
  return TAG_KINDS.reduce((n, kind) => n + TAG_FIELD_IDS.filter((f) => config?.[kind]?.[f] !== undefined).length, 0);
}
