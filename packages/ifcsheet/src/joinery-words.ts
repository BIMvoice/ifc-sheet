/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words the joinery schedule (door, window, all) is printed with (#581), English and Romanian, under the keys of the app's
 * catalogues (`schedule.row.*`, `joineryRow.varies`, `joinery.op.*`). The app says them through its own translation, `ifcsheet build`
 * through `joinerySayFor`; a test in the app compares the two, so a sheet and its PDF cannot word the table differently.
 * `joineryLabelsOf` builds the labels for both. Imports no parser, so a catalogue may load it.
 */

import type { PanelOperation } from '@ifc-lite/create';
import type { ScheduleLabels } from './joinery-schedule-layout.js';
import type { SheetLocale } from './units-and-numbers.js';

export const JOINERY_WORDS_EN = {
  'schedule.row.mark': 'Mark',
  'schedule.row.name': 'Name',
  'schedule.row.size': 'Size W × H (mm)',
  'schedule.row.operation': 'Opening',
  'schedule.row.sill': 'Sill height (mm)',
  'schedule.row.total': 'Total',
  'schedule.row.uValue': 'U (W/m²K)',
  'schedule.row.fire': 'Fire rating',
  'joineryRow.varies': 'varies',
  'joinery.op.fixed': 'Fixed',
  'joinery.op.side-left': 'Side-hung, hinges left',
  'joinery.op.side-right': 'Side-hung, hinges right',
  'joinery.op.tilt-turn-left': 'Tilt and turn, hinges left',
  'joinery.op.tilt-turn-right': 'Tilt and turn, hinges right',
  'joinery.op.bottom-hung': 'Bottom-hung (tilt)',
  'joinery.op.top-hung': 'Top-hung',
  'joinery.op.pivot-horizontal': 'Pivot, horizontal axis',
  'joinery.op.pivot-vertical': 'Pivot, vertical axis',
  'joinery.op.sliding-left': 'Sliding to the left',
  'joinery.op.sliding-right': 'Sliding to the right',
  'joinery.op.sliding-vertical': 'Sliding up',
  'joinery.op.swing-left': 'Leaf, hinges left',
  'joinery.op.swing-right': 'Leaf, hinges right',
  'joinery.op.double-acting-left': 'Double-acting, hinges left',
  'joinery.op.double-acting-right': 'Double-acting, hinges right',
  'joinery.op.door-sliding-left': 'Sliding leaf to the left',
  'joinery.op.door-sliding-right': 'Sliding leaf to the right',
  'joinery.op.folding-left': 'Folding to the left',
  'joinery.op.folding-right': 'Folding to the right',
} as const;

export type JoineryWordKey = keyof typeof JOINERY_WORDS_EN;

export const JOINERY_WORDS_RO: Record<JoineryWordKey, string> = {
  'schedule.row.mark': 'Poz.',
  'schedule.row.name': 'Denumire',
  'schedule.row.size': 'Dimensiuni L × H (mm)',
  'schedule.row.operation': 'Deschidere',
  'schedule.row.sill': 'Înălțime parapet (mm)',
  'schedule.row.total': 'Total',
  'schedule.row.uValue': 'U (W/m²K)',
  'schedule.row.fire': 'Rezistență la foc',
  'joineryRow.varies': 'diferă',
  'joinery.op.fixed': 'Fix',
  'joinery.op.side-left': 'Cu deschidere laterală, balamale pe stânga',
  'joinery.op.side-right': 'Cu deschidere laterală, balamale pe dreapta',
  'joinery.op.tilt-turn-left': 'Oscilo-batant, balamale pe stânga',
  'joinery.op.tilt-turn-right': 'Oscilo-batant, balamale pe dreapta',
  'joinery.op.bottom-hung': 'Oscilant',
  'joinery.op.top-hung': 'Proiectant',
  'joinery.op.pivot-horizontal': 'Pivotant, ax orizontal',
  'joinery.op.pivot-vertical': 'Pivotant, ax vertical',
  'joinery.op.sliding-left': 'Glisant spre stânga',
  'joinery.op.sliding-right': 'Glisant spre dreapta',
  'joinery.op.sliding-vertical': 'Glisant în sus',
  'joinery.op.swing-left': 'Canat batant, balamale pe stânga',
  'joinery.op.swing-right': 'Canat batant, balamale pe dreapta',
  'joinery.op.double-acting-left': 'Canat pendulant, balamale pe stânga',
  'joinery.op.double-acting-right': 'Canat pendulant, balamale pe dreapta',
  'joinery.op.door-sliding-left': 'Canat glisant spre stânga',
  'joinery.op.door-sliding-right': 'Canat glisant spre dreapta',
  'joinery.op.folding-left': 'Pliant spre stânga',
  'joinery.op.folding-right': 'Pliant spre dreapta',
};

/** Says a word of the joinery schedule. */
export type JoinerySay = (key: JoineryWordKey) => string;

/** The words of a language for the command line: Romanian for `ro`, English otherwise. */
export function joinerySayFor(language: string): JoinerySay {
  const words: Record<JoineryWordKey, string> = /^ro\b/i.test(language) ? JOINERY_WORDS_RO : JOINERY_WORDS_EN;
  return (key) => words[key];
}

/** The joinery schedule's labels under `title`, in the language of the figures `locale` writes: the one build both hosts use. */
export function joineryLabelsOf(say: JoinerySay, locale: SheetLocale, title: string): ScheduleLabels {
  return {
    locale, title, mark: say('schedule.row.mark'), name: say('schedule.row.name'), size: say('schedule.row.size'), operation: say('schedule.row.operation'),
    sill: say('schedule.row.sill'), total: say('schedule.row.total'), uValue: say('schedule.row.uValue'), fire: say('schedule.row.fire'), varies: say('joineryRow.varies'),
    op: (op: PanelOperation) => say(`joinery.op.${op}`),
  };
}
