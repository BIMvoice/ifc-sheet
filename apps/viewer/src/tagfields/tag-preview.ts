/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the configurator shows on a real element: for one field, what each
 * source reads and which of them the tag takes. Built from the same reads
 * as the resolver (`tag-fields.ts`), so the preview cannot disagree with the tag.
 */

import { readStored, type LabelElement } from '@/labels/label-resolve';
import { sourceRef, sourcesOf, sourceText, tagKindOf, type TagFieldConfig, type TagFieldId, type TagSource } from './tag-fields';

export interface SourcePreview {
  source: TagSource;
  /** What the element has there; '' when nothing. */
  text: string;
  /** The source the tag takes: the first with a value. */
  used: boolean;
}

const asText = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** Each source of `field` as it reads on `el`, with the first that has a value marked. `sources` replaces the configured list (an edit not yet saved). */
export function previewSources(el: LabelElement, sources: readonly TagSource[]): SourcePreview[] {
  let taken = false;
  return sources.map((source) => {
    const text = asText(readStored(sourceRef(source), el).value);
    const used = !taken && text !== '';
    if (used) taken = true;
    return { source, text, used };
  });
}

/** The sources the configuration gives the field for the kind of `el`. */
export const sourcesFor = (config: TagFieldConfig | undefined, el: LabelElement, field: TagFieldId): TagSource[] => sourcesOf(config, tagKindOf(el.className()), field);

/** What `el` offers to map a field to: each property, quantity and type property it carries. */
export function sourceCandidates(el: LabelElement): TagSource[] {
  return [
    ...el.propertySets().flatMap((s) => s.properties.map((p): TagSource => ({ kind: 'pset', pset: s.name, property: p.name }))),
    ...el.quantitySets().flatMap((s) => s.quantities.map((q): TagSource => ({ kind: 'quantity', qto: s.name, name: q.name }))),
    ...el.typePropertySets().flatMap((s) => s.properties.map((p): TagSource => ({ kind: 'type-pset', pset: s.name, property: p.name }))),
  ];
}

const escapeName = (name: string): string => name.replace(/[\\.]/g, (c) => `\\${c}`);

/** A source as it is typed: `Set.Property`, a dot or backslash inside a name written `\.` or `\\` (`Office\.v2.Nr`); an attribute is its name. */
export function sourcePath(s: TagSource): string {
  switch (s.kind) {
    case 'attribute': return s.name;
    case 'quantity': return `${escapeName(s.qto)}.${escapeName(s.name)}`;
    default: return `${escapeName(s.pset)}.${escapeName(s.property)}`;
  }
}

/**
 * `Set.Property` as a source of the given kind; null when it is not two names. The set and the name part at the first
 * dot that is not escaped (`\.`); typed plainly, a path that is exactly a set and a name of `known` (what the element
 * carries) is that source, so `Office.v2.Nr` finds the set `Office.v2`.
 */
export function parseSourcePath(kind: 'pset' | 'quantity' | 'type-pset', path: string, known: readonly TagSource[] = []): TagSource | null {
  const typed = path.trim();
  const match = known.find((s) => s.kind === kind && sourceText(s) === typed);
  if (match) return match;
  const parts: string[] = [''];
  for (let i = 0; i < typed.length; i++) {
    const c = typed[i];
    if (c === '\\' && i + 1 < typed.length) parts[parts.length - 1] += typed[++i];
    else if (c === '.' && parts.length === 1) parts.push('');
    else parts[parts.length - 1] += c;
  }
  if (parts.length !== 2) return null;
  const set = parts[0].trim(), name = parts[1].trim();
  if (!set || !name) return null;
  if (kind === 'quantity') return { kind, qto: set, name };
  return { kind, pset: set, property: name };
}
