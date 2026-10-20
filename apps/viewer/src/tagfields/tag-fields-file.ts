/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tag-field sources as the project file and the library file keep them.
 * Read strictly: a malformed source fails with its path. A tag kind, a field or
 * a source kind this version does not know is dropped (a source with a note on
 * the console), so a file from a newer version still opens. A field whose every
 * source is dropped reads its default rather than nothing.
 */

import { fail } from '@/catalogue/readers';
import { SOURCE_ATTRIBUTES, TAG_FIELD_IDS, TAG_KINDS, type TagFieldConfig, type TagFieldId, type TagKind, type TagSource } from './tag-fields';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

const SOURCE_KINDS: readonly unknown[] = ['attribute', 'pset', 'quantity', 'type-pset'];

/** A source of a kind a newer version writes: dropped, not failed. */
const unknownKind = (v: unknown): v is Json & { kind: string } => isObject(v) && typeof v.kind === 'string' && !SOURCE_KINDS.includes(v.kind);

function readSource(v: unknown, path: string, what?: string): TagSource {
  const bad = (): never => fail(path, 'must be a source { kind: attribute | pset | quantity | type-pset, … }', what);
  if (!isObject(v)) return bad();
  if (v.kind === 'attribute') {
    const name = SOURCE_ATTRIBUTES.find((a) => a === v.name);
    return name ? { kind: 'attribute', name } : fail(`${path}.name`, `must be one of ${SOURCE_ATTRIBUTES.join(', ')}`, what);
  }
  if (v.kind === 'pset' || v.kind === 'type-pset') {
    const pset = text(v.pset), property = text(v.property);
    return pset && property ? { kind: v.kind, pset, property } : bad();
  }
  if (v.kind === 'quantity') {
    const qto = text(v.qto), name = text(v.name);
    return qto && name ? { kind: 'quantity', qto, name } : bad();
  }
  return bad();
}

/** The configuration `raw` holds; undefined when it holds none. */
export function readTagFields(raw: unknown, path: string, what?: string): TagFieldConfig | undefined {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) return fail(path, 'must be an object { door: { mark: […] }, … }', what);
  const out: TagFieldConfig = {};
  for (const kind of TAG_KINDS) {
    const fields = raw[kind];
    if (fields === undefined) continue;
    if (!isObject(fields)) fail(`${path}.${kind}`, 'must be an object { mark: […], name: […] }', what);
    const kept: Partial<Record<TagFieldId, TagSource[]>> = {};
    for (const field of TAG_FIELD_IDS) {
      const list = fields[field];
      if (list === undefined) continue;
      if (!Array.isArray(list)) fail(`${path}.${kind}.${field}`, 'must be a list of sources', what);
      const sources = list.flatMap((s, i): TagSource[] => {
        const at = `${path}.${kind}.${field}[${i}]`;
        if (!unknownKind(s)) return [readSource(s, at, what)];
        console.warn(`${at}: a source of kind "${s.kind}" is not known to this version and was left out`);
        return [];
      });
      if (sources.length || !list.length) kept[field] = sources;
    }
    if (Object.keys(kept).length) out[kind as TagKind] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}
