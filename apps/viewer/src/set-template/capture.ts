/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Taking a set template (#21) out of the open project. The rules come from the
 * engine (`captureSetTemplate`); this reads what only the app knows: which
 * annotation commands the views carry (their drafts), the schedules and the
 * sheets they hang on, and the title block layout, parameters and tag fields,
 * which the template carries for the app to apply.
 */

import { captureSetTemplate, layoutOf, sheetGroup, type AnnotationCommand, type ScheduleRule, type SetTemplate } from '@bimvoice/ifcsheet';
import { isDimAll } from '@/dimall/apply';
import type { DraftEntity } from '@/drafting/types';
import { useProjectStore, type ProjectState } from '@/project/project-store';
import { MARK_TYPE_ID, ROOM_TYPE_ID } from '@/tagall/types';

/** The annotation commands each view's drafts show they were given: TAGALL's labels, DIMALL's strings, LEVELALL's level marks. */
export function annotationsByView(drafts: readonly DraftEntity[]): Map<string, AnnotationCommand[]> {
  const out = new Map<string, Set<AnnotationCommand>>();
  const add = (viewId: string, command: AnnotationCommand): void => { out.set(viewId, (out.get(viewId) ?? new Set()).add(command)); };
  for (const d of drafts) {
    if (d.params.atype === MARK_TYPE_ID || d.params.atype === ROOM_TYPE_ID) add(d.viewId, 'tagAll');
    if (isDimAll(d)) add(d.viewId, 'dimAll');
    if (d.shape.type === 'level' && d.shape.ref !== undefined) add(d.viewId, 'levelAll');
  }
  return new Map([...out].map(([id, set]) => [id, [...set]]));
}

/** The schedules of the project that hang on a sheet of their own, by kind: not the parts a schedule was split into, which are cut from one model's rows. */
export function scheduleRules(s: Pick<ProjectState, 'schedules' | 'sheets'>): ScheduleRule[] {
  return (s.schedules ?? []).flatMap((schedule) => {
    const sheet = s.sheets.find((sh) => (sh.viewports ?? []).some((vp) => vp.viewId === schedule.id));
    if (schedule.sub || !sheet || sheetGroup(sheet) !== 'schedules') return [];
    return [{ kind: schedule.kind, name: schedule.name, ...(schedule.scale === undefined ? {} : { scale: schedule.scale }), sheet: { name: sheet.name, layout: layoutOf(sheet) } }];
  });
}

/** The set template the project stands for now, named `name`. */
export function captureProjectTemplate(name: string, s: ProjectState = useProjectStore.getState()): SetTemplate {
  const carried: Record<string, unknown> = {};
  if (s.titleBlockTemplate) carried.titleBlockTemplate = s.titleBlockTemplate;
  if (s.titleBlockParams) carried.titleBlockParams = s.titleBlockParams;
  if (s.tagFields) carried.tagFields = s.tagFields;
  return captureSetTemplate({
    name, views: s.views, sheets: s.sheets, annotated: annotationsByView(s.drafts), schedules: scheduleRules(s),
    ...(s.sheetNumbering ? { numbering: s.sheetNumbering } : {}), carried,
  });
}
