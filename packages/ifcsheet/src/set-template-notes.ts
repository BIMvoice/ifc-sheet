/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What applying a set template tells the person (#21), as catalogue keys and
 * their parameters, in the shape of the automatic set's own notes (`SetNote`).
 * The English is here, once: the app's English catalogue spreads it and the
 * command line prints it (`describeTemplateNote`).
 */

export type TemplateNoteKey =
  | 'setTemplate.note.skipped.plan'
  | 'setTemplate.note.skipped.section'
  | 'setTemplate.note.skipped.elevation'
  | 'setTemplate.note.skipped.site'
  | 'setTemplate.note.defaulted'
  | 'setTemplate.note.unplaced'
  | 'setTemplate.note.rescaled'
  | 'setTemplate.note.schedule'
  | 'setTemplate.note.carried';

export interface TemplateNote {
  key: TemplateNoteKey;
  params: Record<string, string | number>;
}

/** The English of every note, by catalogue key. */
export const SET_TEMPLATE_EN: Record<TemplateNoteKey, string> = {
  'setTemplate.note.skipped.plan': 'Skipped on {sheet}: the template has a plan for storey {storey} (0 is the ground storey) and this model has no such storey.',
  'setTemplate.note.skipped.section': 'Skipped on {sheet}: the template has section {place} and this model offers fewer sections.',
  'setTemplate.note.skipped.elevation': 'Skipped on {sheet}: the template has the {direction} elevation and this model has none.',
  'setTemplate.note.skipped.site': 'Skipped on {sheet}: the template has site plan {place} and this project has fewer site plans. Add one and place it on a sheet.',
  'setTemplate.note.defaulted': 'Not in the template, laid out the way the automatic set does, on the paper and at the scale of the last {series} sheet of the template: {names}.',
  'setTemplate.note.unplaced': 'The template has no {series} sheet, so these were left off the sheets: {names}.',
  'setTemplate.note.rescaled': '{sheet} is drawn at 1:{used}, not the template\'s 1:{wanted}: its drawings do not fit the paper at that scale.',
  'setTemplate.note.carried': 'The template\'s {what} could not be read and was not applied.',
  'setTemplate.note.schedule': 'The template carries the {kind} schedule "{name}". It is added in the app, not by the command line.',
};

/** A note in English, parameters filled in. */
export function describeTemplateNote(note: TemplateNote): string {
  return SET_TEMPLATE_EN[note.key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in note.params ? String(note.params[name]) : whole));
}
