/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which numbering group a sheet takes by what it holds. The numbers
 * themselves come from the project's scheme (`numbering.ts`).
 */

import type { NumberGroup, ProjectSheet, ProjectViewKind } from './types';

/** The sheet as a person's own: no longer numbered by the program. */
export function withoutAutoNumber(sheet: ProjectSheet): ProjectSheet {
  const { autoNumber: _auto, ...rest } = sheet;
  return rest;
}

/** The group of sheets a view of this kind belongs to; `undefined` (a schedule, a legend) is `other`. */
export function sheetGroupOfView(kind: ProjectViewKind | undefined): NumberGroup {
  return kind === 'plan' ? 'plans' : kind === 'elevation' ? 'elevations' : kind === 'section' ? 'sections' : 'other';
}
