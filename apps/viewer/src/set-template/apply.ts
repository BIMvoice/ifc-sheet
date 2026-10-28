/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a set template carries besides sheet rules, applied to a project that is
 * being started from it (#21): the numbering, the title block layout and its
 * parameters, the tag fields, the schedules by kind. Each is read with the
 * project file's own reader, so a template cannot bring in what a project file
 * would refuse; what cannot be read is left out and said.
 */

import type { SetTemplate } from '@bimvoice/ifcsheet';
import type { Reason } from '@/project/drawing-set';
import { addRegisterToSet, hangSchedule } from '@/project/drawing-set-actions';
import { readTitleBlockParams, readTitleBlockTemplate } from '@/project/title-block-file';
import { useProjectStore } from '@/project/project-store';
import { addSchedule, updateSchedule } from '@/joinery/schedules';
import { readTagFields } from '@/tagfields/tag-fields-file';
import { resolve } from '@/i18n/registry';

/** The numbering first: the sheets of the set are numbered by it. A project that already chose its own keeps it. */
export function applyNumbering(template: SetTemplate): void {
  if (template.numbering && !useProjectStore.getState().sheetNumbering) useProjectStore.setState({ sheetNumbering: template.numbering, dirty: true });
}

const unreadable = (what: string): Reason => ({ key: 'setTemplate.note.carried', params: { what } });

/** The title block layout and parameters and the tag fields the template carries, where the project has none of its own. */
function applyCarried(template: SetTemplate, notes: Reason[]): void {
  const { carried } = template;
  if (!carried) return;
  const have = useProjectStore.getState();
  const patch: Partial<Pick<typeof have, 'titleBlockTemplate' | 'titleBlockParams' | 'tagFields'>> = {};
  if (carried.titleBlockTemplate !== undefined && !have.titleBlockTemplate) {
    const layout = readTitleBlockTemplate(carried.titleBlockTemplate);
    if (layout) patch.titleBlockTemplate = layout;
    else notes.push(unreadable(resolve('setTemplate.what.titleBlockTemplate')));
  }
  if (carried.titleBlockParams !== undefined && !have.titleBlockParams) {
    const params = readTitleBlockParams(carried.titleBlockParams);
    if (params) patch.titleBlockParams = params;
    else notes.push(unreadable(resolve('setTemplate.what.titleBlockParams')));
  }
  if (carried.tagFields !== undefined && !have.tagFields) {
    try {
      const fields = readTagFields(carried.tagFields, '/carried/tagFields');
      if (fields) patch.tagFields = fields;
    } catch (error) {
      console.warn('[ifcsheet] the template\'s tag fields could not be read', error);
      notes.push(unreadable(resolve('setTemplate.what.tagFields')));
    }
  }
  if (Object.keys(patch).length > 0) useProjectStore.setState({ ...patch, dirty: true });
}

/** The schedules the template names, each added by kind and hung on a sheet of its own, as the Wall's own buttons do. */
function applySchedules(template: SetTemplate): void {
  for (const rule of template.schedules) {
    if (rule.kind === 'register') {
      addRegisterToSet(rule.name);
      continue;
    }
    const id = addSchedule(rule.kind, rule.name);
    if (rule.scale !== undefined) updateSchedule(id, { scale: rule.scale });
    hangSchedule(id);
  }
}

/** Everything but the sheets of the set, after the set is made; the notes of what could not be applied. */
export function applyExtras(template: SetTemplate): Reason[] {
  const notes: Reason[] = [];
  applyCarried(template, notes);
  applySchedules(template);
  return notes;
}
