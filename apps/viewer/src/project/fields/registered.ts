/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The fields registered by their own file (#144), found, not listed: no line of this file or of `./index.ts` is edited
 * to add a field, so two PRs adding a field each touch only their own files. A NEW FIELD's `fields/<key>.ts`:
 *   - exports `registeredFields`, the list of the fields it defines (`export const registeredFields = [myField] as const;`);
 *   - declares their keys here, which `MissingField` in `./index.ts` checks every `ProjectDocument` key against:
 *     `declare module './registered' { interface RegisteredFieldKeys { myKey: true } }`.
 * See `./germany-permit.ts`. Every `fields/*.ts` is loaded (not the tests, the samples, `./index.ts` or this file); one
 * without `registeredFields` adds nothing, and the frozen list in `./index.ts` keeps its fields there.
 *
 * The list's order is not the folder's: `assembleFields` sorts by field key, so the key order of a saved file (the fields
 * of `./index.ts` first, then these) does not depend on file names or load order. A field registered here is written
 * after every field of `./index.ts`; its place among the registered ones is its key's.
 */
import type { DocumentField, FieldKey } from './define';

/** The key of every registered field, each added by its own file through `declare module './registered'`. */
export interface RegisteredFieldKeys {}

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

const modules = import.meta.glob<{ registeredFields?: readonly DocumentField<FieldKey>[] }>(['./*.ts', '!./*.test.ts', '!./*.sample.ts', '!./index.ts'], { eager: true });

/** Every field a `fields/<key>.ts` registers, in no particular order (`assembleFields` sorts them). */
export const REGISTERED_FIELD_DEFS: readonly DocumentField<FieldKey>[] = Object.values(modules).flatMap((m) => m.registeredFields ?? []);
