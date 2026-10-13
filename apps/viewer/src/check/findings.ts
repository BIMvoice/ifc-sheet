/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The checks of a drawing set, each a pure function of the project that
 * returns findings as data. `checkSet` runs them all, in a fixed order: sheet
 * by sheet, then the project-wide ones.
 */

import { sectionLink } from '@/drafting/section-symbol';
import type { DraftEntity } from '@/drafting/types';
import type { ProjectSheet } from '@/project/types';
import type { CheckInput, Finding } from './types';

type View = CheckInput['views'][number];

const sheetOf = (sheets: readonly ProjectSheet[], viewId: string): ProjectSheet | undefined => sheets.find((s) => (s.viewports ?? []).some((v) => v.viewId === viewId));
const draftsIn = (drafts: readonly DraftEntity[], viewId: string) => drafts.filter((d) => d.viewId === viewId);
const isDetail = (v: View) => v.detail !== undefined && v.detail !== null;
const kindOfClass = (c: string): 'door' | 'window' | 'room' | null => (/^ifcdoor/i.test(c) ? 'door' : /^ifcwindow/i.test(c) ? 'window' : /^ifcspace/i.test(c) ? 'room' : null);
const onSheet = (input: CheckInput, v: View) => sheetOf(input.sheets, v.id);

/** Plans on a sheet (details have their own marks and are left out). */
const platedPlans = (input: CheckInput) => input.views.flatMap((v) => (v.kind === 'plan' && !isDetail(v) && onSheet(input, v) ? [{ v, sheet: onSheet(input, v)! }] : []));

/** A door or window a plan on a sheet shows that has no tag or label; a room with no label. A plan not yet drawn cannot be read and is said so. */
export function untaggedElements(input: CheckInput): Finding[] {
  return platedPlans(input).flatMap(({ v, sheet }): Finding[] => {
    const shown = input.planElements(v.id);
    if (shown === null) return [{ kind: 'planNotDrawn', key: 'check.planNotDrawn', sheetId: sheet.id, viewId: v.id, params: { view: v.name, sheet: sheet.number } }];
    const marked = new Set(draftsIn(input.drafts, v.id).flatMap((d) => [d.params.labelOf, d.params.tagOf].filter((g): g is string => typeof g === 'string')));
    const out: Finding[] = [];
    for (const [kind, key] of [['door', 'untaggedOpenings'], ['window', 'untaggedOpenings'], ['room', 'unlabelledRooms']] as const) {
      const missing = [...new Set(shown.filter((e) => kindOfClass(e.className) === kind && !marked.has(e.guid)).map((e) => e.guid))];
      if (missing.length > 0) out.push({ kind: key, key: `check.${key}`, sheetId: sheet.id, viewId: v.id, guids: missing, params: { count: missing.length, what: kind, view: v.name, sheet: sheet.number }, fix: 'TAGALL' });
    }
    return out;
  });
}

export function plansWithoutDimensions(input: CheckInput): Finding[] {
  return platedPlans(input).filter(({ v }) => !draftsIn(input.drafts, v.id).some((d) => d.shape.type === 'dimension'))
    .map(({ v, sheet }): Finding => ({ kind: 'planNoDimensions', key: 'check.planNoDimensions', sheetId: sheet.id, viewId: v.id, params: { view: v.name, sheet: sheet.number }, fix: 'DIMALL' }));
}

export function viewsWithoutLevelMarks(input: CheckInput): Finding[] {
  return input.views.filter((v) => (v.kind === 'section' || v.kind === 'elevation') && !isDetail(v) && onSheet(input, v) && !draftsIn(input.drafts, v.id).some((d) => d.shape.type === 'level'))
    .map((v): Finding => ({ kind: 'viewNoLevelMarks', key: 'check.viewNoLevelMarks', sheetId: onSheet(input, v)!.id, viewId: v.id, params: { view: v.name, sheet: onSheet(input, v)!.number }, fix: 'LEVELALL' }));
}

export function viewsOnNoSheet(input: CheckInput): Finding[] {
  return input.views.filter((v) => v.kind !== '3d' && !isDetail(v) && !onSheet(input, v)).map((v): Finding => ({ kind: 'viewOffSheet', key: 'check.viewOffSheet', viewId: v.id, params: { view: v.name } }));
}

export function emptySheets(input: CheckInput): Finding[] {
  return input.sheets.filter((s) => (s.viewports ?? []).length === 0).map((s): Finding => ({ kind: 'emptySheet', key: 'check.emptySheet', sheetId: s.id, params: { sheet: s.number } }));
}

/** The title-block fields a sheet leaves empty: project, title, drawn by, date. */
export function emptyTitleBlocks(input: CheckInput): Finding[] {
  return input.sheets.flatMap((s) => (['project', 'title', 'drawnBy', 'date'] as const)
    .filter((field) => !((field === 'title' ? s.name : s.titleBlock?.[field]) ?? '').trim())
    .map((field): Finding => ({ kind: 'titleBlockEmpty', key: 'check.titleBlockEmpty', sheetId: s.id, params: { field, sheet: s.number } })));
}

/** Sheets that share a number (compared without case or surrounding space): one finding per number. */
export function duplicateNumbers(input: CheckInput): Finding[] {
  const groups = new Map<string, ProjectSheet[]>();
  for (const s of input.sheets) groups.set(s.number.trim().toLowerCase(), [...(groups.get(s.number.trim().toLowerCase()) ?? []), s]);
  return [...groups.values()].filter((g) => g.length > 1).map((g): Finding => ({ kind: 'duplicateNumber', key: 'check.duplicateNumber', sheetId: g[0].id, params: { number: g[0].number, count: g.length } }));
}

/** A section whose mark is on no plan that is on a sheet. */
export function sectionsMarkedOnNoSheetPlan(input: CheckInput): Finding[] {
  return input.views.filter((v) => v.kind === 'section' && !isDetail(v)).flatMap((v): Finding[] => {
    const planIds = new Set(input.drafts.filter((d) => sectionLink(d) === v.id).map((d) => d.viewId));
    const shown = [...planIds].some((id) => input.views.some((p) => p.id === id && p.kind === 'plan' && onSheet(input, p)));
    return shown ? [] : [{ kind: 'sectionMarkOffSheet', key: 'check.sectionMarkOffSheet', viewId: v.id, params: { view: v.name } }];
  });
}

/** A detail on no sheet: its mark has no sheet reference. */
export function detailsOnNoSheet(input: CheckInput): Finding[] {
  return input.views.filter((v) => isDetail(v) && !onSheet(input, v)).map((v): Finding => ({ kind: 'detailOffSheet', key: 'check.detailOffSheet', viewId: v.id, params: { view: v.name } }));
}

/** A tag or label whose element is no longer in the model. (A dimension is measured from drawn points and names no element.) */
export function danglingAnnotations(input: CheckInput): Finding[] {
  return input.drafts.flatMap((d): Finding[] => {
    const guid = [d.params.labelOf, d.params.tagOf].find((g): g is string => typeof g === 'string');
    if (!guid || input.elementExists(guid)) return [];
    const view = input.views.find((v) => v.id === d.viewId);
    return [{ kind: 'danglingAnnotation', key: 'check.danglingAnnotation', viewId: d.viewId, sheetId: view ? onSheet(input, view)?.id : undefined, draftId: d.id, guids: [guid], params: { view: view?.name ?? '' } }];
  });
}

const sheetRank = (input: CheckInput, f: Finding) => (f.sheetId ? input.sheets.findIndex((s) => s.id === f.sheetId) : Number.MAX_SAFE_INTEGER);

export function checkSet(input: CheckInput): Finding[] {
  const all = [
    ...emptyTitleBlocks(input), ...duplicateNumbers(input), ...emptySheets(input),
    ...untaggedElements(input), ...plansWithoutDimensions(input), ...viewsWithoutLevelMarks(input),
    ...viewsOnNoSheet(input), ...sectionsMarkedOnNoSheetPlan(input), ...detailsOnNoSheet(input), ...danglingAnnotations(input),
  ];
  // Sheet by sheet in the order of the set, then what belongs to no sheet; the order of the checks within.
  return all.map((f, i) => ({ f, i })).sort((a, b) => sheetRank(input, a.f) - sheetRank(input, b.f) || a.i - b.i).map((x) => x.f);
}
