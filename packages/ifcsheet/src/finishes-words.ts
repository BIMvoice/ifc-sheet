/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words the room finishes schedule is printed with (#581), English and Romanian, under the keys of the app's catalogues
 * (`finishes.*`). The app says them through its own translation, `ifcsheet build` through `finishesSayFor`; a test in the app
 * compares the two, so a sheet and its PDF cannot word the table differently. `finishLabelsOf` builds the labels for both.
 * Imports no parser, so a catalogue may load it.
 */

import type { RoomFinishLabels } from './room-finishes-layout.js';
import type { SheetLocale } from './units-and-numbers.js';

export const FINISHES_WORDS_EN = {
  'finishes.number': 'No.',
  'finishes.room': 'Room',
  'finishes.level': 'Level',
  'finishes.floor': 'Floor',
  'finishes.wall': 'Wall',
  'finishes.ceiling': 'Ceiling',
  'finishes.area': 'Area m²',
  'finishes.sharedNote': '* A covering shared by several rooms: its area is split equally between them.',
} as const;

export type FinishesWordKey = keyof typeof FINISHES_WORDS_EN;

export const FINISHES_WORDS_RO: Record<FinishesWordKey, string> = {
  'finishes.number': 'Nr.',
  'finishes.room': 'Încăpere',
  'finishes.level': 'Nivel',
  'finishes.floor': 'Pardoseală',
  'finishes.wall': 'Perete',
  'finishes.ceiling': 'Tavan',
  'finishes.area': 'Arie m²',
  'finishes.sharedNote': '* Un finisaj comun mai multor încăperi: aria lui se împarte egal între ele.',
};

/** Says a word of the finishes table. */
export type FinishesSay = (key: FinishesWordKey) => string;

/** The words of a language for the command line: Romanian for `ro`, English otherwise. */
export function finishesSayFor(language: string): FinishesSay {
  const words: Record<FinishesWordKey, string> = /^ro\b/i.test(language) ? FINISHES_WORDS_RO : FINISHES_WORDS_EN;
  return (key) => words[key];
}

/** The finishes table's labels under `title`, in the language of the figures `locale` writes: the one build both hosts use. */
export function finishLabelsOf(say: FinishesSay, locale: SheetLocale, title: string): RoomFinishLabels {
  return {
    locale, title, number: say('finishes.number'), room: say('finishes.room'), level: say('finishes.level'), floor: say('finishes.floor'),
    wall: say('finishes.wall'), ceiling: say('finishes.ceiling'), area: say('finishes.area'), sharedNote: say('finishes.sharedNote'),
  };
}
