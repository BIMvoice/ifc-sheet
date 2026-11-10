/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words the material takeoff is printed with (#581), English and Romanian, under the keys of the app's catalogues
 * (`takeoff.*`, and `measuredQty.*` for the figures measured from geometry, which the quantities by type share). The app says
 * them through its own translation, `ifcsheet build` through `takeoffSayFor`; a test in the app compares the two, so a sheet and
 * its PDF cannot word the table differently. `takeoffLabelsOf` builds the labels for both. Imports no parser, so a catalogue
 * may load it.
 */

import type { TakeoffLabels } from './material-takeoff-layout.js';
import type { MeasuredWords } from './measured-marks.js';
import type { SheetLocale } from './units-and-numbers.js';
import { fillTemplate } from './boq-words.js';

/** A word with plural forms, as the Romanian catalogue writes it. */
export interface PluralForms { one?: string; few?: string; many?: string; other: string }

export const TAKEOFF_WORDS_EN = {
  'takeoff.material': 'Material',
  'takeoff.elements': 'Elements',
  'takeoff.volume': 'Volume m³',
  'takeoff.area': 'Area m²',
  'takeoff.usedIn': 'Used in',
  'takeoff.total': 'Total',
  'measuredQty.note': '* Measured from the geometry: the model states no quantity. Volume: the closed solid as drawn, openings cut. Wall area: one side face, openings removed (the two sides averaged). Slab area: the top face, openings removed.',
  'measuredQty.unmeasured': '{count} element(s) state no volume and their geometry is not a single closed solid, so no volume was measured for them.',
  'measuredQty.column': 'Measured from geometry',
  'measuredQty.volume': 'volume',
  'measuredQty.area': 'area',
} as const;

export type TakeoffWordKey = keyof typeof TAKEOFF_WORDS_EN;

export const TAKEOFF_WORDS_RO: Record<TakeoffWordKey, string | PluralForms> = {
  'takeoff.material': 'Material',
  'takeoff.elements': 'Elemente',
  'takeoff.volume': 'Volum m³',
  'takeoff.area': 'Arie m²',
  'takeoff.usedIn': 'Folosit în',
  'takeoff.total': 'Total',
  'measuredQty.note': '* Măsurat din geometrie: modelul nu declară cantitatea. Volum: solidul închis, așa cum este desenat, cu golurile decupate. Aria peretelui: o singură față laterală, fără goluri (media celor două fețe). Aria plăcii: fața superioară, fără goluri.',
  'measuredQty.unmeasured': {
    one: 'Un element nu declară volumul, iar geometria lui nu este un singur solid închis, deci volumul lui nu a fost măsurat.',
    few: '{count} elemente nu declară volumul, iar geometria lor nu este un singur solid închis, deci volumul lor nu a fost măsurat.',
    other: '{count} de elemente nu declară volumul, iar geometria lor nu este un singur solid închis, deci volumul lor nu a fost măsurat.',
  },
  'measuredQty.column': 'Măsurat din geometrie',
  'measuredQty.volume': 'volum',
  'measuredQty.area': 'arie',
};

/** Says a word of the takeoff table; `count` picks the plural form of a word that has them. */
export type TakeoffSay = (key: TakeoffWordKey, params?: Record<string, string | number>) => string;

/** The words of a language for the command line: Romanian for `ro`, English otherwise. */
export function takeoffSayFor(language: string): TakeoffSay {
  const ro = /^ro\b/i.test(language);
  const words: Record<TakeoffWordKey, string | PluralForms> = ro ? TAKEOFF_WORDS_RO : TAKEOFF_WORDS_EN;
  return (key, params) => {
    const word = words[key];
    if (typeof word === 'string') return fillTemplate(word, params);
    const count = typeof params?.count === 'number' ? params.count : 0;
    const form = new Intl.PluralRules('ro', { maximumSignificantDigits: 21 }).select(count) as keyof PluralForms;
    return fillTemplate(word[form] ?? word.other, params);
  };
}

/** The words that explain a figure measured from geometry (#74), shared by the takeoff and the quantities by type. */
export function measuredWordsOf(say: TakeoffSay): MeasuredWords {
  return {
    note: say('measuredQty.note'), unmeasured: (count) => say('measuredQty.unmeasured', { count }),
    column: say('measuredQty.column'), volume: say('measuredQty.volume'), area: say('measuredQty.area'),
  };
}

/** The takeoff table's labels under `title`, in the language of the figures `locale` writes: the one build both hosts use. */
export function takeoffLabelsOf(say: TakeoffSay, locale: SheetLocale, title: string): TakeoffLabels {
  return {
    locale, title, material: say('takeoff.material'), elements: say('takeoff.elements'), volume: say('takeoff.volume'), area: say('takeoff.area'),
    usedIn: say('takeoff.usedIn'), total: say('takeoff.total'), measured: measuredWordsOf(say),
  };
}
