/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheet numbers by what a sheet holds: general sheets (the site plan) A-0xx,
 * plans A-1xx, elevations A-2xx, sections A-3xx, a room's interior elevations
 * A-4xx, drafting views A-5xx, everything else A-9xx.
 */

import type { ProjectSheet, ProjectView } from './types';

export type SheetNumberGroup = 'general' | 'plans' | 'elevations' | 'sections' | 'interiors' | 'details' | 'other';

const BASE: Record<SheetNumberGroup, number> = { general: 0, plans: 100, elevations: 200, sections: 300, interiors: 400, details: 500, other: 900 };

/** The sheet as a person's own: no longer numbered by the program. */
export function withoutAutoNumber(sheet: ProjectSheet): ProjectSheet {
  const { autoNumber: _auto, ...rest } = sheet;
  return rest;
}

/** The group of sheets a view belongs to: an interior elevation its own, apart from the facades; a drafting view the details; none (a schedule, a legend) is `other`. */
export function sheetGroupOfView(view: ProjectView | undefined): SheetNumberGroup {
  if (view?.kind === 'elevation') return view.interior ? 'interiors' : 'elevations';
  return view?.kind === 'plan' ? 'plans' : view?.kind === 'section' ? 'sections' : view?.kind === 'drafting' ? 'details' : 'other';
}

/** The next free number in the group's hundred: `A-001`, `A-101`, `A-201`, `A-301`, `A-401`, `A-501`, `A-901`. */
export function nextSheetNumber(sheets: readonly Pick<ProjectSheet, 'number'>[], group: SheetNumberGroup = 'plans'): string {
  const taken = new Set(sheets.map((s) => s.number));
  for (let n = BASE[group] + 1; ; n++) {
    const number = `A-${String(n).padStart(3, '0')}`;
    if (!taken.has(number)) return number;
  }
}
