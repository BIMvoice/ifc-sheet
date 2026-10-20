/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing register's sheets: its own, numbered in the scheme's register
 * slot, and the continuation sheets it needs as the set grows. Split out of
 * `drawing-set-actions.ts` (which re-exports it) to keep that under the module size rule.
 */

import { addSchedule } from '@/joinery/schedules';
import { registerFit } from '@/joinery/register-layout';
import { drawingArea, SET_PAPER } from './drawing-set';
import { DEFAULT_SCHEME, registerNumberIn } from './numbering';
import { numberingScheme, useProjectStore } from './project-store';
import { freshProjectId } from './view-defaults';
import type { ProjectSheet } from './types';

/** The register's number under the project's scheme (#115): A-000, else the first free number of the general series A-001… (`registerNumberIn`). */
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
 * page: as many as `registerFit` needs for a row per sheet of the set, the
 * continuation sheets counted. A continuation sheet is numbered after the
 * register's own (A-000.1, A-000.2…, skipping a number another sheet has) and
 * holds the register's next page; one no longer needed is removed. Runs
 * whenever the sheets change, so the register never runs off its paper.
 */
export function syncRegisterPages(): void {
  const { sheets, schedules } = useProjectStore.getState();
  const register = schedules?.find((s) => s.kind === 'register');
  if (!register) return;
  const pageOf = (s: ProjectSheet) => (s.viewports ?? []).find((vp) => vp.viewId === register.id)?.page ?? 0;
  const holders = sheets.filter((s) => (s.viewports ?? []).some((vp) => vp.viewId === register.id)).sort((a, b) => pageOf(a) - pageOf(b));
  const first = holders[0];
  if (!first) return;
  const others = sheets.length - holders.length;
  const areaH = drawingArea(first.paper ?? SET_PAPER).h;
  // Each continuation sheet is a row of the register too: settle on a count that holds itself.
  let pages = 1;
  for (let i = 0; i < 8; i++) {
    const need = registerFit(others + pages, areaH).pages;
    if (need === pages) break;
    pages = need;
  }
  const keep = holders.slice(0, pages);
  const gone = new Set(holders.slice(pages).map((s) => s.id));
  const taken = new Set(sheets.filter((s) => !gone.has(s.id)).map((s) => s.number));
  const added: ProjectSheet[] = [];
  for (let page = keep.length; page < pages; page++) {
    let n = page;
    while (taken.has(`${first.number}.${n}`)) n++;
    const number = `${first.number}.${n}`;
    taken.add(number);
    const vp = (first.viewports ?? []).find((v) => v.viewId === register.id);
    added.push({
      id: freshProjectId('sheet'), number, series: 'general', name: first.name, createdAt: Date.now(), paper: first.paper, orientation: first.orientation,
      viewports: [{ ...(vp ?? { x: 0, y: 0, scale: 1, width: 0, height: 0, center: null }), id: freshProjectId('viewport'), viewId: register.id, page }],
    });
  }
  // A continuation sheet removed by hand leaves a gap: the ones kept show pages 0, 1, 2… in order.
  const renumbered = new Map(keep.flatMap((s, i) => (pageOf(s) === i ? [] : [[s.id, {
    ...s, viewports: (s.viewports ?? []).map((vp) => (vp.viewId !== register.id ? vp : i === 0 ? (({ page: _p, ...rest }) => rest)(vp) : { ...vp, page: i })),
  }] as const])));
  if (added.length === 0 && gone.size === 0 && renumbered.size === 0) return;
  useProjectStore.setState({ sheets: [...sheets.filter((s) => !gone.has(s.id)).map((s) => renumbered.get(s.id) ?? s), ...added], dirty: true });
}

// The register follows the set: a sheet added or removed may need a page more or less.
useProjectStore.subscribe((state, previous) => {
  if (state.sheets !== previous.sheets || state.schedules !== previous.schedules) syncRegisterPages();
});
