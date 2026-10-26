/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's fields, filled once for the project and read the same way
 * by the app's sheets and this package's PDF: the typed record over what the
 * model says (`title-block-sources.ts`), a sheet's own fields over those.
 */

import type { ProjectSheet } from './document.js';

/**
 * The text fields that are typed, in the order the title block prints them. The revision is
 * not one: a sheet's title block reads its latest revision (`currentRevisionOf`).
 */
export const TITLE_BLOCK_FIELDS = ['project', 'address', 'client', 'organisation', 'phase', 'projectNumber', 'projectManager', 'designer', 'drawnBy', 'checkedBy', 'date'] as const;
export type TitleBlockField = (typeof TITLE_BLOCK_FIELDS)[number];

/** The logo: an image data URL, project-wide only. */
export const LOGO_FIELD = 'logo';
/** Larger logos would swell every saved project file. */
export const LOGO_MAX_BYTES = 512 * 1024;

/** What `sheet` prints: the project's fields, its own on top, the project's name when no project field is set. */
export function titleBlockOf(sheet: Pick<ProjectSheet, 'titleBlock'>, project: Record<string, string> | undefined, projectName: string): Record<string, string> {
  const fields = { ...project, ...sheet.titleBlock };
  if (!fields.project) fields.project = projectName;
  return fields;
}
