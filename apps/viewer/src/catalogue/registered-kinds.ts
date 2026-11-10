/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * The library (`.bvlib`) kinds registered by their own file (#144), found, not listed: no line of `catalogue-file.ts`,
 * `catalogue-merge.ts` or `catalogue-store.ts` is edited to add one. A NEW KIND's `catalogue/kinds/<key>.ts`:
 *   - exports `registeredCatalogueKinds`, `[defineCatalogueKind({ key, empty, read, merge, fromProject, applyToProject })]`;
 *   - declares the key and the type of its list here, which `Catalogue` and `CatalogueKind` take: 
 *     `declare module '../registered-kinds' { interface RegisteredCatalogueData { myKind: MyItem[] } }`.
 * See `./kinds/classification-mappings.ts`. Every `kinds/*.ts` is loaded (not the tests); one without `registeredCatalogueKinds`
 * adds nothing, and the kinds of `catalogue-file.ts` keep their place there. The dialogs also want a `library.kind.<key>` label
 * and the project file wants a field (`project/fields/`); those are files of their own too.
 *
 * Counts are the list's length, a kind's export is the whole list, and a kind is read, merged and written back as one
 * list: a kind that needs more (a count of its own, a cut-down export, references to other kinds) stays in the frozen
 * code until that is added here.
 *
 * The order is not the folder's: `assembleCatalogueKinds` sorts by key, after the kinds of `catalogue-file.ts`, so the
 * dialogs and a saved file do not depend on file names or load order.
 */
import type { ProjectState } from '@/project/project-store';
import type { ClashPolicy, KindReport } from './catalogue-merge';

/** The list of every registered kind, each added by its own file through `declare module './registered-kinds'`. */
export interface RegisteredCatalogueData {}

export interface CatalogueKindDef<K extends keyof RegisteredCatalogueData> {
  key: K;
  /** What a catalogue holds of this kind when none was given. */
  empty: () => RegisteredCatalogueData[K];
  /** The kind's list from a parsed `.bvlib` file (`what` names the file in an error); an absent entry is the empty list. */
  read: (file: Record<string, unknown>, what: string) => RegisteredCatalogueData[K];
  /** The incoming list merged into the project's under the clash policy. */
  merge: (mine: RegisteredCatalogueData[K], incoming: RegisteredCatalogueData[K], policy: ClashPolicy, fresh: (prefix: string) => string) => { list: RegisteredCatalogueData[K]; report: KindReport };
  /** The list the project holds now. */
  fromProject: (state: ProjectState) => RegisteredCatalogueData[K];
  /** The project's change to hold `items`, or nothing when it already does. */
  applyToProject: (state: ProjectState, items: RegisteredCatalogueData[K]) => Partial<ProjectState> | undefined;
}

/** A kind with its list type erased, what the registry holds; `defineCatalogueKind` is the one place the types are checked. */
export interface RegisteredCatalogueKind {
  key: string;
  empty: () => unknown;
  read: (file: Record<string, unknown>, what: string) => unknown;
  merge: (mine: unknown, incoming: unknown, policy: ClashPolicy, fresh: (prefix: string) => string) => { list: unknown; report: KindReport };
  fromProject: (state: ProjectState) => unknown;
  applyToProject: (state: ProjectState, items: unknown) => Partial<ProjectState> | undefined;
}

/** Check a kind against the type its file declared for its key (a key not declared does not compile). */
export function defineCatalogueKind<K extends keyof RegisteredCatalogueData>(def: CatalogueKindDef<K>): RegisteredCatalogueKind {
  return def as unknown as RegisteredCatalogueKind;
}

/** `registered` sorted by key; a key listed twice, or one of `legacy` (the kinds of `catalogue-file.ts`), throws. */
export function assembleCatalogueKinds(legacy: readonly string[], registered: readonly RegisteredCatalogueKind[]): RegisteredCatalogueKind[] {
  const sorted = [...registered].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const seen = new Set<string>(legacy);
  if (seen.size !== legacy.length) throw new Error('Two library kinds share a key in the frozen list.');
  for (const d of sorted) {
    if (seen.has(d.key)) throw new Error(`Two library kinds share the key "${d.key}".`);
    seen.add(d.key);
  }
  return sorted;
}

const modules = import.meta.glob<{ registeredCatalogueKinds?: readonly RegisteredCatalogueKind[] }>(['./kinds/*.ts', '!./kinds/*.test.ts'], { eager: true });

/** Every kind a `kinds/<key>.ts` registers, in no particular order (`assembleCatalogueKinds` sorts them). */
export const REGISTERED_CATALOGUE_KIND_DEFS: readonly RegisteredCatalogueKind[] = Object.values(modules).flatMap((m) => m.registeredCatalogueKinds ?? []);
