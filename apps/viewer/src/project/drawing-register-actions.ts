/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The drawing register on the set's sheets: its number, its sheet, its continuation pages (split from `drawing-set-actions.ts`, which re-exports these). */

import { drawingArea, SET_PAPER } from './drawing-set';
import { addSchedule } from '@/joinery/schedules';
import { registerHolders, registerSheetFit } from './drawing-register';
import { withContinuationPages } from './continuation-pages';
import { DEFAULT_SCHEME, registerNumberIn } from './numbering';
import { numberingScheme, useProjectStore } from './project-store';
import { freshProjectId } from './view-defaults';
import type { ProjectSheet } from './types';

/** The register's number under the project's scheme: its slot before the general series (A-000, A00 in a sequential scheme) while free, else the first free number of the general series (`registerNumberIn`). */
export function registerNumber(sheets: readonly Pick<ProjectSheet, 'number'>[], scheme = DEFAULT_SCHEME): string {
  return registerNumberIn(sheets, scheme);
}

/**
 * The drawing register on a sheet of its own, numbered A-000 (`registerNumber`), its table at the top left of the
 * drawing area. It holds no rows: they are read from the sheets whenever it is drawn. A register already on a
 * sheet returns that sheet.
 */
export function addRegisterToSet(name: string): string {
  const { sheets, schedules } = useProjectStore.getState();
  const existing = schedules?.find((s) => s.kind === 'register');
  const placed = existing && sheets.find((sh) => (sh.viewports ?? []).some((vp) => vp.viewId === existing.id));
  if (placed) return placed.id;
  const scheduleId = existing?.id ?? addSchedule('register', name);
  const area = drawingArea(SET_PAPER);
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: registerNumber(sheets, numberingScheme()), series: 'general', name, createdAt: Date.now(), paper: SET_PAPER, orientation: 'landscape',
    viewports: [{ id: freshProjectId('viewport'), viewId: scheduleId, x: area.x + area.w / 2, y: area.y + area.h / 2, scale: 1, width: 0, height: 0, center: null }],
  };
  useProjectStore.setState({ sheets: [...useProjectStore.getState().sheets, sheet], dirty: true });
  syncRegisterPages();
  return sheet.id;
}

/**
 * The register's sheets, its own first and then its continuation sheets by
 * page: as many as `registerSheetFit` needs for a row per sheet of the set, the
 * continuation sheets counted. A continuation sheet is numbered after the
 * register's own (A-000.1, A-000.2…, skipping a number another sheet has) and
 * holds the register's next page; one no longer needed is removed. Runs
 * whenever the sheets change, so the register never runs off its paper.
 */
export function syncRegisterPages(): void {
  const { sheets, schedules } = useProjectStore.getState();
  const register = schedules?.find((s) => s.kind === 'register');
  if (!register) return;
  const holders = registerHolders(sheets, register.id);
  if (!holders[0]) return;
  const others = sheets.length - holders.length;
  // Each continuation sheet is a row of the register too: settle on a count that holds itself.
  let pages = 1;
  for (let i = 0; i < 8; i++) {
    const need = registerSheetFit(others + pages, sheets, register.id).pages;
    if (need === pages) break;
    pages = need;
  }
  const next = withContinuationPages(sheets, register.id, pages);
  if (next) useProjectStore.setState({ sheets: next, dirty: true });
}

// The register follows the set: a sheet added or removed may need a page more or less.
useProjectStore.subscribe((state, previous) => {
  if (state.sheets !== previous.sheets || state.schedules !== previous.schedules) syncRegisterPages();
});
