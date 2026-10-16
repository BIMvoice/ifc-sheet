/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The text of a parametric label: literal text with `{field}` placeholders.
 *
 *   {Name}                          an attribute: Name, Tag, ObjectType, Description,
 *                                   PredefinedType, GlobalId, Class (Wall), IfcClass (IfcWall)
 *   {Pset_WallCommon.FireRating}    a property, else a quantity, of that set; the
 *                                   element's own first, then its type's
 *   {Qto_WallBaseQuantities.Length:0.00 m}
 *                                   number pattern (0, 0.0, #,##0.00) and a unit
 *   {Type.Name}                     the element's type; {Type.Pset.Prop} reads the type only
 *   {Material}  {Storey}            the material names, the storey name
 *   {Pset.Prop|n/a}                 text to show when there is no value
 *   {Tag ?? Name}                   the first of these that has a value
 *   {Mark}                          the Tag when it is a mark (D-01), not a machine identifier (a GUID)
 *
 * `\{`, `\}`, `\|` and `\\` write the character; `\n` and a real line break both
 * break the line. A brace that is not closed stays literal and is reported.
 */

import { parseFormatSpec, type FormatSpec } from './label-format';

export const ATTRIBUTE_FIELDS = ['Name', 'LongName', 'Tag', 'Mark', 'ObjectType', 'Description', 'PredefinedType', 'GlobalId'] as const;
export type AttributeField = (typeof ATTRIBUTE_FIELDS)[number];

export type FieldRef =
  | { kind: 'attribute'; name: AttributeField }
  | { kind: 'class'; withPrefix: boolean }
  | { kind: 'typeName' }
  | { kind: 'material' }
  | { kind: 'storey' }
  /** `from: 'type'` reads the element's type only (`Type.Set.Prop`). */
  | { kind: 'property'; set: string; name: string; from: 'any' | 'type' };

export interface TemplateField {
  type: 'field';
  /** The path as written, without format and fallback. */
  source: string;
  ref: FieldRef;
  /** Read when `ref` has no value, in order (`{Tag ?? Name}`). */
  alternatives?: FieldRef[];
  format?: FormatSpec;
  /** Shown instead of the placeholder when there is no value. */
  fallback?: string;
}

export type TemplateSegment = { type: 'text'; text: string } | TemplateField;

export interface TemplateIssue {
  /** Index in the template text. */
  at: number;
  kind: 'unclosed' | 'empty' | 'unknown';
  text: string;
}

export interface ParsedTemplate {
  segments: TemplateSegment[];
  issues: TemplateIssue[];
}

const BY_LOWER = new Map(ATTRIBUTE_FIELDS.map((n) => [n.toLowerCase(), n]));

/** What a path names, or null when it is not a field this module knows. */
export function parseFieldRef(path: string): FieldRef | null {
  const parts = path.split('.').map((p) => p.trim());
  if (parts.some((p) => p === '')) return null;
  const lower = parts[0].toLowerCase();
  if (parts.length === 1) {
    const attribute = BY_LOWER.get(lower);
    if (attribute) return { kind: 'attribute', name: attribute };
    if (lower === 'class') return { kind: 'class', withPrefix: false };
    if (lower === 'ifcclass') return { kind: 'class', withPrefix: true };
    if (lower === 'material') return { kind: 'material' };
    if (lower === 'storey') return { kind: 'storey' };
    return null;
  }
  if (lower === 'type') {
    if (parts.length === 2 && parts[1].toLowerCase() === 'name') return { kind: 'typeName' };
    return parts.length === 3 ? { kind: 'property', set: parts[1], name: parts[2], from: 'type' } : null;
  }
  return parts.length === 2 ? { kind: 'property', set: parts[0], name: parts[1], from: 'any' } : null;
}

/** A path as the template writes it, for the field picker. */
export function fieldPath(ref: FieldRef): string {
  switch (ref.kind) {
    case 'attribute': return ref.name;
    case 'class': return ref.withPrefix ? 'IfcClass' : 'Class';
    case 'typeName': return 'Type.Name';
    case 'material': return 'Material';
    case 'storey': return 'Storey';
    case 'property': return `${ref.from === 'type' ? 'Type.' : ''}${ref.set}.${ref.name}`;
  }
}

/** Splits the inside of a field at the first unescaped `:` and the first `|` after it. */
function splitField(body: string): { path: string; spec: string | null; fallback: string | null } {
  const colon = body.indexOf(':');
  const bar = body.indexOf('|');
  const specEnd = bar >= 0 ? bar : body.length;
  if (colon >= 0 && colon < specEnd) {
    return { path: body.slice(0, colon), spec: body.slice(colon + 1, specEnd), fallback: bar >= 0 ? body.slice(bar + 1) : null };
  }
  return { path: bar >= 0 ? body.slice(0, bar) : body, spec: null, fallback: bar >= 0 ? body.slice(bar + 1) : null };
}

const ESCAPES: Record<string, string> = { '{': '{', '}': '}', '|': '|', '\\': '\\', n: '\n' };

function unescape(text: string): string {
  return text.replace(/\\([{}|\\n])/g, (_m, c: string) => ESCAPES[c]);
}

export function parseTemplate(text: string): ParsedTemplate {
  const segments: TemplateSegment[] = [];
  const issues: TemplateIssue[] = [];
  let literal = '';
  const flush = () => {
    if (literal) segments.push({ type: 'text', text: literal });
    literal = '';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length && ESCAPES[text[i + 1]] !== undefined) {
      literal += ESCAPES[text[i + 1]];
      i += 2;
    } else if (c === '{') {
      let end = i + 1;
      while (end < text.length && text[end] !== '}') end += text[end] === '\\' ? 2 : 1;
      if (end >= text.length) {
        issues.push({ at: i, kind: 'unclosed', text: text.slice(i) });
        literal += unescape(text.slice(i));
        break;
      }
      const body = text.slice(i + 1, end);
      const { path, spec, fallback } = splitField(body);
      const refs = path.trim() === '' ? [] : unescape(path).split('??').map(parseFieldRef);
      const ref = refs.length > 0 && refs.every((r) => r !== null) ? refs[0] : null;
      if (!ref) {
        issues.push({ at: i, kind: path.trim() === '' ? 'empty' : 'unknown', text: `{${body}}` });
        literal += `{${unescape(body)}}`;
      } else {
        flush();
        segments.push({
          type: 'field', source: fieldPath(ref), ref,
          ...(refs.length > 1 ? { alternatives: refs.slice(1) as FieldRef[] } : {}),
          ...(spec !== null && spec.trim() !== '' ? { format: parseFormatSpec(unescape(spec)) } : {}),
          ...(fallback !== null ? { fallback: unescape(fallback) } : {}),
        });
      }
      i = end + 1;
    } else {
      literal += c;
      i += 1;
    }
  }
  flush();
  return { segments, issues };
}

/** The fields of a template, in order. */
export const templateFields = (t: ParsedTemplate): TemplateField[] => t.segments.filter((s): s is TemplateField => s.type === 'field');
