/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words the quantities by type are printed with (#581), English and Romanian, under the keys of the app's catalogues
 * (`typeQty.*`; the words that explain a measured figure are the takeoff's `measuredQty.*`, `takeoff-words.ts`). The app says them
 * through its own translation, `ifcsheet build` through `typesSayFor`; a test in the app compares the two, so a sheet and its PDF
 * cannot word the table differently. `typeLabelsOf` builds the labels for both. Imports no parser, so a catalogue may load it.
 */

import type { TypeQuantityLabels } from './type-quantities-layout.js';
import { measuredWordsOf, takeoffSayFor, type TakeoffSay, type TakeoffWordKey } from './takeoff-words.js';
import type { SheetLocale } from './units-and-numbers.js';

export const TYPES_WORDS_EN = {
  'typeQty.type': 'Type',
  'typeQty.class': 'Class',
  'typeQty.level': 'Storey',
  'typeQty.count': 'Count',
  'typeQty.length': 'Length m',
  'typeQty.area': 'Area m²',
  'typeQty.volume': 'Volume m³',
  'typeQty.noQto': 'No Qto',
  'typeQty.total': 'Total',
  'typeQty.noType': '(no type)',
  'typeQty.noLevel': 'No storey',
  'typeQty.classification': 'Classification',
  'typeQty.classificationTitle': 'Title',
  'typeQty.unclassified': 'No classification',
} as const;

export type TypesWordKey = keyof typeof TYPES_WORDS_EN;

export const TYPES_WORDS_RO: Record<TypesWordKey, string> = {
  'typeQty.type': 'Tip',
  'typeQty.class': 'Clasă',
  'typeQty.level': 'Nivel',
  'typeQty.count': 'Număr',
  'typeQty.length': 'Lungime m',
  'typeQty.area': 'Arie m²',
  'typeQty.volume': 'Volum m³',
  'typeQty.noQto': 'Fără Qto',
  'typeQty.total': 'Total',
  'typeQty.noType': '(fără tip)',
  'typeQty.noLevel': 'Fără nivel',
  'typeQty.classification': 'Clasificare',
  'typeQty.classificationTitle': 'Titlu',
  'typeQty.unclassified': 'Fără clasificare',
};

/** Says a word of the types table, or of the note on a measured figure. */
export type TypesSay = (key: TypesWordKey | TakeoffWordKey, params?: Record<string, string | number>) => string;

/** The words of a language for the command line: Romanian for `ro`, English otherwise. */
export function typesSayFor(language: string): TypesSay {
  const words: Record<TypesWordKey, string> = /^ro\b/i.test(language) ? TYPES_WORDS_RO : TYPES_WORDS_EN;
  const measured: TakeoffSay = takeoffSayFor(language);
  return (key, params) => (key in words ? words[key as TypesWordKey] : measured(key as TakeoffWordKey, params));
}

/** The types table's labels under `title`, in the language of the figures `locale` writes: the one build both hosts use. */
export function typeLabelsOf(say: TypesSay, locale: SheetLocale, title: string): TypeQuantityLabels {
  return {
    locale, title, type: say('typeQty.type'), class: say('typeQty.class'), level: say('typeQty.level'), count: say('typeQty.count'),
    length: say('typeQty.length'), area: say('typeQty.area'), volume: say('typeQty.volume'), noQto: say('typeQty.noQto'),
    total: say('typeQty.total'), noType: say('typeQty.noType'), noLevel: say('typeQty.noLevel'),
    classification: say('typeQty.classification'), classificationTitle: say('typeQty.classificationTitle'), unclassified: say('typeQty.unclassified'),
    measured: measuredWordsOf(say),
  };
}
