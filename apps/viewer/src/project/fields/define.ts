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
import type { Json } from '@bimvoice/ifcsheet';
import type { ProjectDocument } from '../types';

export type FieldKey = keyof ProjectDocument;

/**
 * How the file reader fills one field from the file's (migrated) object: the entries it contributes, none when the
 * file has nothing to say (so an absent field stays absent). Throws on a file the field cannot read.
 */
export type FieldReader<K extends FieldKey> = (raw: Json) => Partial<Pick<ProjectDocument, K>>;

export interface DocumentField<K extends FieldKey> {
  key: K;
  /**
   * Reads the field from a project file (`parseProjectFile`). Required: a field with no reader does not compile, so a
   * new field can not be saved and then lost on open. Its readers live next to it, not in `project-file.ts`.
   */
  read: FieldReader<K>;
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

/** Reads `key` only when the file has it, as `read` makes it. */
export const whenPresent = <K extends FieldKey>(key: K, read: (value: unknown) => ProjectDocument[K]): FieldReader<K> => (raw) =>
  (raw[key] !== undefined ? { [key]: read(raw[key]) } : {}) as Partial<Pick<ProjectDocument, K>>;

/** Reads `key` and keeps what `read` makes only when it is not empty (`undefined`, `''`, ...). */
export const whenUsable = <K extends FieldKey>(key: K, read: (value: unknown) => ProjectDocument[K]): FieldReader<K> => (raw) => {
  const value = read(raw[key]);
  return (value ? { [key]: value } : {}) as Partial<Pick<ProjectDocument, K>>;
};

export const defineField = <K extends FieldKey>(field: DocumentField<K>): DocumentField<K> => field;

/** The fields whose value is `V` (or absent). */
type FieldsOf<V> = { [P in FieldKey]-?: [NonNullable<ProjectDocument[P]>] extends [V] ? P : never }[FieldKey];
type ListKey = FieldsOf<readonly unknown[]>;
type RecordKey = Exclude<FieldsOf<Readonly<Record<string, unknown>>>, ListKey>;

/**
 * A list that is empty in a new project, written as `[]` when missing and loaded as `[]` when absent. `read` makes the
 * file's list (`[]` for none); with `presentOnly` a file without the key reads without it.
 */
export const listField = <K extends ListKey>(key: K, read: (raw: Json) => ProjectDocument[K], options: { presentOnly?: boolean } = {}): DocumentField<K> => {
  const none = () => [] as unknown as ProjectDocument[K];
  const reader: FieldReader<K> = (raw) => (options.presentOnly && raw[key] === undefined ? {} : { [key]: read(raw) }) as Partial<Pick<ProjectDocument, K>>;
  return { key, read: reader, empty: none, fallback: none, load: (v) => v ?? none() };
};

/** A record that is empty in a new project, written as `{}` when missing and loaded as `{}` when absent. */
export const recordField = <K extends RecordKey>(key: K, read: (raw: Json) => ProjectDocument[K]): DocumentField<K> => {
  const none = () => ({}) as ProjectDocument[K];
  return { key, read: (raw) => ({ [key]: read(raw) }) as Partial<Pick<ProjectDocument, K>>, empty: none, fallback: none, load: (v) => v ?? none() };
};

/** Absent unless set (`whenPresent`, `whenUsable` or your own reader says when): undefined in a new project, not written when unset, and loaded as the file has it (absent clears it). */
export const optionalField = <K extends FieldKey>(key: K, read: FieldReader<K>): DocumentField<K> => ({ key, read, empty: () => undefined as ProjectDocument[K], load: (v) => v as ProjectDocument[K] });
