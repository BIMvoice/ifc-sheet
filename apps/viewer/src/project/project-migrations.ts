/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project file's schema version, and the steps that bring an older file to it.
 *
 * `migrations[v]` takes a document saved at version v and returns it at v + 1. A file is
 * run through every step from its own version up to `PROJECT_FILE_VERSION`, in order, before
 * it is read. A file without a `version` was saved before the field was written and is
 * version 1. A file from a newer build is refused whole, with a message the user can read
 * (`ProjectFileTooNewError`), rather than read as far as it happens to fit.
 *
 * Changing the file's shape: bump `PROJECT_FILE_VERSION`, add `migrations[<old version>]`,
 * and commit a file saved at the old version beside `fixtures/`.
 */

import { PROJECT_FILE_VERSION } from '@bimvoice/ifcsheet';
import type { TranslatableMessage } from '@/i18n/types';

// One copy, with the headless project reader (`@bimvoice/ifcsheet`); a bump is made there.
export { PROJECT_FILE_VERSION, declaredVersion } from '@bimvoice/ifcsheet';

export type RawProject = Record<string, unknown>;
export type ProjectMigration = (doc: RawProject) => RawProject;

/** Keyed by the version the step reads; empty while version 1 is the only shape there has been. */
export const PROJECT_MIGRATIONS: Readonly<Record<number, ProjectMigration>> = {};

/** The file was saved by a newer build than this one. */
export class ProjectFileTooNewError extends Error {
  readonly found: number;
  readonly supported: number;
  readonly translatable: TranslatableMessage;
  constructor(found: number, supported: number) {
    super(`Project file version ${found} is newer than this build reads (${supported})`);
    this.name = 'ProjectFileTooNewError';
    this.found = found;
    this.supported = supported;
    this.translatable = { labelKey: 'project.file.tooNew', params: { found, supported } };
  }
}

/**
 * Brings `raw` (already known to declare a valid version) to `current`. Throws
 * `ProjectFileTooNewError` for a newer file and an error naming the gap for a missing step.
 */
export function migrateProject(
  raw: RawProject,
  version: number,
  migrations: Readonly<Record<number, ProjectMigration>> = PROJECT_MIGRATIONS,
  current: number = PROJECT_FILE_VERSION,
): RawProject {
  if (version > current) throw new ProjectFileTooNewError(version, current);
  let doc = raw;
  for (let v = version; v < current; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`Not a project file: no migration from version ${v} to ${v + 1}`);
    doc = { ...step(doc), version: v + 1 };
  }
  return doc;
}
