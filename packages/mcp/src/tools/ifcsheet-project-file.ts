/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project file the drawing-set tools write and read (#165): the one place that says what a set looks like as a project
 * document. `ifcsheet_save_project`, the `ifcsheet://session/project` resource and the schema of that document
 * (`ifcsheet-project-schema.ts`) all take it from here, so what is saved, what is shown and what is validated cannot differ.
 */

import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from '@bimvoice/ifcsheet';
import type { SheetSetEntry } from './ifcsheet-store.js';

/** The key the session writes its schedule sheets under; every other key of a loaded file is carried back unchanged. */
export const SCHEDULES_KEY = 'ifcsheetSchedules';
/** The view kinds a project file may hold (`ProjectViewKind`). */
export const VIEW_KINDS = ['plan', 'section', 'elevation', '3d', 'drafting'] as const;

/** The project file of a set as a value: the document, its format and version, and the schedule sheets (no timestamp: `savedAt` is the writer's). */
export function projectFileBody(entry: SheetSetEntry): Record<string, unknown> {
  return { ...entry.set.document, format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, [SCHEDULES_KEY]: entry.schedules };
}
