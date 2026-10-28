/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The saved project file's identity: its format name, the schema version this build reads and how a file declares
 * its version. The web app (`project/project-migrations.ts`) and the headless reader (`project-read.ts`) both
 * take them from here, so a bump of the version is made once.
 *
 * Migration steps (the app's `PROJECT_MIGRATIONS`) are still in the app. While there are none the headless reader
 * needs none; the app's test fails the day one is added, so that step moves here with it.
 */

export const PROJECT_FILE_FORMAT = 'ifclite-project';
export const PROJECT_FILE_VERSION = 1;

/** The version a file declares: a whole number from 1, or 1 when it declares none. Null when it declares something else. */
export function declaredVersion(raw: Record<string, unknown>): number | null {
  if (raw.version === undefined) return 1;
  return typeof raw.version === 'number' && Number.isInteger(raw.version) && raw.version >= 1 ? raw.version : null;
}
