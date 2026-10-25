/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SET_TEMPLATE_EN } from '@bimvoice/ifcsheet';
import type { TranslationValue } from '../types';

/** Set templates (#21): saving how a set is made, and making the set of another model by it. The notes are the engine's own English (`SET_TEMPLATE_EN`), so the command line and the app say the same. */
export const setTemplateEn = {
  ...SET_TEMPLATE_EN,
  'setTemplate.dir.south': 'south',
  'setTemplate.dir.north': 'north',
  'setTemplate.dir.east': 'east',
  'setTemplate.dir.west': 'west',
  'setTemplate.what.titleBlockTemplate': 'title block layout',
  'setTemplate.what.titleBlockParams': 'title block parameters',
  'setTemplate.what.tagFields': 'tag fields',
  'wall.setTemplate.save': 'Save as set template',
  'wall.setTemplate.saveHint': 'Keeps how this set is made, not the drawings: a plan per storey, the elevations and the sections, each sheet\'s paper and scale, the numbering, the schedules. Apply it to another model and the same set appears for that building.',
  'wall.setTemplate.name': 'Template name',
  'wall.setTemplate.summary': 'Sheets: {sheets}. Drawings found by rule: {slots}. Schedules: {schedules}.',
  'wall.setTemplate.annotations': 'Annotation commands on these views: {commands}.',
  'wall.setTemplate.nothing': 'No plan, elevation or section hangs on a sheet of this project, so there are no rules to save.',
  'wall.setTemplate.download': 'Save {file}',
  'wall.setTemplate.keep': 'Keep in this browser',
  'wall.setTemplate.saved': 'Saved {file}.',
  'wall.setTemplate.kept': 'Kept in this browser as {name}.',
  'wall.setTemplate.new': 'New project from a set template',
  'wall.setTemplate.pickFile': 'Choose a set template file…',
  'wall.setTemplate.keptTitle': 'Kept in this browser',
  'wall.setTemplate.use': 'Use {name}',
  'wall.setTemplate.forget': 'Forget {name}',
  'wall.setTemplate.armed': 'The template {name} is ready. Choose the model: its set is made by the template\'s rules.',
  'wall.setTemplate.chooseModel': 'Choose the model (.ifc)…',
  'wall.setTemplate.disarm': 'Do not use the template',
  'wall.setTemplate.refused': 'That file cannot be used as a set template: {detail}',
  'wall.setTemplate.report.title': 'Made from the template {name}',
  'wall.setTemplate.report.allMet': 'Every rule of the template found its drawing in this model.',
  'wall.setTemplate.report.annotating': 'The commands the template records (TAGALL, DIMALL, LEVELALL) are running on the new set.',
  'wall.setTemplate.report.annotated': 'The commands the template records ran on the new set: {added} added on {views} views. Views skipped: {skipped}.',
} as const satisfies Record<string, TranslationValue>;
