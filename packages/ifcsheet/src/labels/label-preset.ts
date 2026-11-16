/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Label presets (#828): a named preset holds groups, each an existing parametric label type and the conditions an
 * element must ALL meet to get that group's label. Elements outside every group stay drawn and unlabelled; the filter
 * only decides where labels go. Pure: the app's LABELALL and any other caller read elements through the same
 * `LabelElement` and use `matchesFilters` / `planLabelPreset`.
 *
 * A group names its label type by NAME, not id, so the same file works in a project whose ids differ.
 */

import type { AnnotationType } from '../annotation-type.js';
import type { DraftEntity } from '../draft-types.js';
import type { LabelTarget } from './label-place.js';
import { readStored, type LabelElement } from './label-resolve.js';

export const LABEL_FILTER_KINDS = ['class', 'type', 'material', 'classification', 'property'] as const;
export type LabelFilterKind = (typeof LABEL_FILTER_KINDS)[number];

/** One condition. `property` reads `set`/`name`; an empty `value` there means "has any value". */
export type LabelFilter =
  | { by: 'class' | 'type' | 'material' | 'classification'; value: string }
  | { by: 'property'; set: string; name: string; value: string };

export interface LabelPresetGroup {
  /** Name of the label annotation type this group draws. */
  labelType: string;
  filters: LabelFilter[];
}

export interface LabelPreset {
  id: string;
  name: string;
  groups: LabelPresetGroup[];
}

const norm = (s: string): string => s.trim().toLowerCase();
const text = (v: unknown): string => (typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'number' || typeof v === 'string' ? String(v) : '');

/** Whether one condition holds for the element: values compare as the same text whatever their case; `Wall` and `IfcWall` are one class. */
export function matchesFilter(el: LabelElement, f: LabelFilter): boolean {
  const want = norm(f.value);
  switch (f.by) {
    case 'class': {
      const have = norm(el.className());
      return have === want || have === `ifc${want}`;
    }
    case 'type': return norm(el.typeName()) === want;
    case 'material': return el.materials().some((m) => norm(m) === want);
    case 'classification': return norm(el.classification?.()?.code ?? '') === want;
    case 'property': {
      const have = norm(text(readStored({ kind: 'property', set: f.set, name: f.name, from: 'any' }, el).value));
      return want === '' ? have !== '' : have === want;
    }
  }
}

/** An element meets a group when it meets every condition; a group without conditions matches nothing (it would label the whole view by accident). */
export function matchesFilters(el: LabelElement, filters: readonly LabelFilter[]): boolean {
  return filters.length > 0 && filters.every((f) => matchesFilter(el, f));
}

/** The text of a condition for a list: `IfcClass = IfcWall`, `Pset.Mark = P1`. */
export function describeFilter(f: LabelFilter): string {
  return f.by === 'property' ? `${f.set}.${f.name}${f.value ? ` = ${f.value}` : ''}` : `${f.by} = ${f.value}`;
}

export interface LabelGroupPlan {
  group: LabelPresetGroup;
  /** The label type the group names, null when the project has no label type of that name. */
  type: AnnotationType | null;
  /** The elements to label: matching, with no label of the type yet, and not already taken by an earlier group of the same type. */
  targets: LabelTarget[];
}

/** The label type a name means among `types`: a label type only, found whatever the case. */
export function labelTypeNamed(types: readonly AnnotationType[], name: string): AnnotationType | null {
  const want = norm(name);
  return types.find((t) => t.tool === 'label' && t.label && norm(t.name) === want) ?? null;
}

/**
 * What running `preset` labels. Every group is planned against the drafts on the view (an element with a label of the
 * type already gets no second one) and against the earlier groups (two groups matching one element with one type give
 * one label). The label type of a group is resolved by name.
 */
export function planLabelPreset(preset: LabelPreset, targets: readonly LabelTarget[], types: readonly AnnotationType[], drafts: readonly DraftEntity[], read: (guid: string) => LabelElement | null): LabelGroupPlan[] {
  const taken = new Map<string, Set<string>>();
  for (const d of drafts) {
    if (typeof d.params.atype === 'string' && typeof d.params.labelOf === 'string') {
      taken.set(d.params.atype, (taken.get(d.params.atype) ?? new Set()).add(d.params.labelOf));
    }
  }
  return preset.groups.map((group) => {
    const type = labelTypeNamed(types, group.labelType);
    if (!type) return { group, type, targets: [] };
    const done = taken.get(type.id) ?? new Set<string>();
    taken.set(type.id, done);
    const picked = targets.filter((t) => {
      if (done.has(t.guid)) return false;
      const el = read(t.guid);
      if (!el || !matchesFilters(el, group.filters)) return false;
      done.add(t.guid);
      return true;
    });
    return { group, type, targets: picked };
  });
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readFilter(v: unknown): LabelFilter | null {
  if (!isObject(v) || typeof v.value !== 'string') return null;
  if (v.by === 'property') return typeof v.set === 'string' && typeof v.name === 'string' && v.set.trim() && v.name.trim() ? { by: 'property', set: v.set, name: v.name, value: v.value } : null;
  if (v.by === 'class' || v.by === 'type' || v.by === 'material' || v.by === 'classification') return v.value.trim() ? { by: v.by, value: v.value } : null;
  return null;
}

/** The presets a saved value holds; an entry or a condition that is not one is dropped, so a file never loads a preset that labels everything. */
export function readLabelPresets(value: unknown): LabelPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((p): LabelPreset[] => {
    if (!isObject(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim() || seen.has(p.id) || !Array.isArray(p.groups)) return [];
    const groups = p.groups.flatMap((g): LabelPresetGroup[] => {
      if (!isObject(g) || typeof g.labelType !== 'string' || !g.labelType.trim() || !Array.isArray(g.filters)) return [];
      const filters = g.filters.map(readFilter);
      return filters.length > 0 && filters.every((f) => f !== null) ? [{ labelType: g.labelType, filters: filters as LabelFilter[] }] : [];
    });
    if (!groups.length) return [];
    seen.add(p.id);
    return [{ id: p.id, name: p.name, groups }];
  });
}

/** The preset a typed name means (case aside), or undefined. */
export function presetNamed(presets: readonly LabelPreset[], name: string): LabelPreset | undefined {
  const want = norm(name);
  return want ? presets.find((p) => norm(p.name) === want) : undefined;
}
