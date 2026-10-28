/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The fields registered by their own file (#144). A NEW FIELD adds its `fields/<key>.ts` and one import line below,
 * kept sorted by file name, plus its entry in `REGISTERED_FIELD_DEFS` (one line, same order). Nothing is appended to the
 * end of the list in `./index.ts` any more, so two PRs adding a field each touch a different line.
 *
 * The list's order is not the file's order: `assembleFields` sorts by field key, so the key order of a saved file
 * (the fields of `./index.ts` first, then these) does not depend on where a line sits or on import order. A field
 * added here is written after every field of `./index.ts`; its place among the registered ones is its key's.
 */
import type { DocumentField, FieldKey } from './define';
import { lineTypesField } from './line-types';

/** `legacy` (the frozen list in `./index.ts`) followed by `registered` sorted by key; a key listed twice throws. */
export function assembleFields(legacy: readonly DocumentField<FieldKey>[], registered: readonly DocumentField<FieldKey>[]): DocumentField<FieldKey>[] {
  const sorted = [...registered].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const all = [...legacy, ...sorted];
  const seen = new Set<string>();
  for (const f of all) {
    if (seen.has(f.key)) throw new Error(`Two document fields share the key "${f.key}".`);
    seen.add(f.key);
  }
  return all;
}

export const REGISTERED_FIELD_DEFS = [
  lineTypesField,
] as const satisfies readonly DocumentField<FieldKey>[];
