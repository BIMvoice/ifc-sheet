/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One field of the project document, described once (#144). The project store builds `EMPTY_PROJECT`,
 * `PROJECT_DOCUMENT_KEYS`, the defaults `projectDocument` writes and what `loadProjectDocument` stores
 * from these, so a new field is one entry in `./index.ts` instead of four edits inside `project-store.ts`.
 *
 * A field file imports types and its own data module only, never `project-store` or `project-file`:
 * the store imports this folder.
 */
import type { ProjectDocument } from '../types';

export type FieldKey = keyof ProjectDocument;

export interface DocumentField<K extends FieldKey> {
  key: K;
  /** The value in a new project (`EMPTY_PROJECT`). Without it, a new project has no such key at all. */
  empty?(): ProjectDocument[K];
  /** What `projectDocument` writes when the store holds nothing (an older file, a project not yet touched). Without it, nothing. */
  fallback?(): ProjectDocument[K];
  /**
   * What `loadProjectDocument` stores for the loaded value. Without it, the loaded document is spread in as it is,
   * so a key the file lacks keeps whatever the store held before.
   */
  load?(value: ProjectDocument[K] | undefined): ProjectDocument[K];
}

export const defineField = <K extends FieldKey>(field: DocumentField<K>): DocumentField<K> => field;

/** The fields whose value is `V` (or absent). */
type FieldsOf<V> = { [P in FieldKey]-?: [NonNullable<ProjectDocument[P]>] extends [V] ? P : never }[FieldKey];
type ListKey = FieldsOf<readonly unknown[]>;
type RecordKey = Exclude<FieldsOf<Readonly<Record<string, unknown>>>, ListKey>;

/** A list that is empty in a new project, written as `[]` when missing and loaded as `[]` when absent. */
export const listField = <K extends ListKey>(key: K): DocumentField<K> => {
  const none = () => [] as unknown as ProjectDocument[K];
  return { key, empty: none, fallback: none, load: (v) => v ?? none() };
};

/** A record that is empty in a new project, written as `{}` when missing and loaded as `{}` when absent. */
export const recordField = <K extends RecordKey>(key: K): DocumentField<K> => {
  const none = () => ({}) as ProjectDocument[K];
  return { key, empty: none, fallback: none, load: (v) => v ?? none() };
};

/** Absent unless set: undefined in a new project, not written when unset, and loaded as the file has it (absent clears it). */
export const optionalField = <K extends FieldKey>(key: K): DocumentField<K> => ({ key, empty: () => undefined as ProjectDocument[K], load: (v) => v as ProjectDocument[K] });
