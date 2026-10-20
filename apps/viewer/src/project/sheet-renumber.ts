/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Renumbering the set: the old to new table to look at first, then one store
 * update that saves the scheme and every sheet's number together. Detail
 * marks, the title blocks, the drawing list and the file names read the
 * sheet's number, so they follow without being edited here.
 */

import { planRenumber, renumbered, type OverrideMode, type RenumberRow } from './numbering';
import { useProjectStore } from './project-store';
import type { NumberingScheme, ProjectIssue, ProjectSchedule } from './types';

/** The drawing register's documents: its sheet keeps the register's slot through a renumbering. */
const registerIds = (schedules: readonly ProjectSchedule[] | undefined): ReadonlySet<string> =>
  new Set((schedules ?? []).filter((s) => s.kind === 'register').map((s) => s.id));

/** What renumbering the project's sheets by `scheme` would do. */
export function previewRenumber(scheme: NumberingScheme, overrides: OverrideMode): RenumberRow[] {
  const { sheets, schedules } = useProjectStore.getState();
  return planRenumber(sheets, scheme, overrides, registerIds(schedules));
}

/** How many of the rows that change a number already went out in an issue, which keeps the number it went out under. */
export function issuedAmong(rows: readonly RenumberRow[], issues: readonly ProjectIssue[] = useProjectStore.getState().issues ?? []): number {
  const issued = new Set(issues.flatMap((i) => i.sheets.map((s) => s.number)));
  return rows.filter((r) => r.from !== r.to && issued.has(r.from)).length;
}

/** Save `scheme` and renumber every sheet by it in one update; returns how many numbers changed. */
export function renumberAll(scheme: NumberingScheme, overrides: OverrideMode): number {
  const { sheets, schedules } = useProjectStore.getState();
  const rows = planRenumber(sheets, scheme, overrides, registerIds(schedules));
  useProjectStore.setState({ sheetNumbering: scheme, sheets: renumbered(sheets, rows, overrides), dirty: true });
  return rows.filter((r) => r.from !== r.to).length;
}

/** Save `scheme` for the sheets made from now on; the sheets already there keep their numbers. */
export function setSchemeForNewSheets(scheme: NumberingScheme): void {
  useProjectStore.setState({ sheetNumbering: scheme, dirty: true });
}
