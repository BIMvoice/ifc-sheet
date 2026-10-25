/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the key presets (`wall-key-presets.en.ts`). Term choices: `../ro-glossary.md`. */
export const wallKeyPresetsRo = {
  'wall.keys.preset.label': 'Set de taste',
  'wall.keys.preset.default': 'Implicit IfcSheet',
  'wall.keys.preset.defaultHint': 'Tastele cu care vine IfcSheet.',
  'wall.keys.preset.autocad': 'Ca în AutoCAD',
  'wall.keys.preset.autocadHint': 'Tastele pe care le așteaptă un utilizator AutoCAD: Ctrl+Y reface, doar Delete șterge (Backspace editează linia de comandă), Ctrl+PageUp și Ctrl+PageDown schimbă planșa. Celelalte taste sunt ca în setul implicit.',
  'wall.keys.preset.switched': 'Set de taste: {preset}.',
  'wall.keys.preset.switchedDropped': { one: 'Set de taste: {preset}. {count} dintre tastele dumneavoastră a fost eliminată, fiindcă setul o folosește pentru altă acțiune.', other: 'Set de taste: {preset}. {count} dintre tastele dumneavoastră au fost eliminate, fiindcă setul le folosește pentru alte acțiuni.' },
  'wall.keys.preset.custom': { one: 'Modificările dumneavoastră: {count} acțiune pe o tastă aleasă de dumneavoastră, peste {preset}.', other: 'Modificările dumneavoastră: {count} acțiuni pe taste alese de dumneavoastră, peste {preset}.' },
  'wall.keys.preset.noCustom': 'Nicio modificare proprie: fiecare acțiune are o tastă din {preset}.',
  'wall.keys.preset.offerAutocad': 'Aceste taste merg împreună cu modul AutoCAD (nume de comenzi scrise, Enter repetă). Este oprit. Îl porniți și pe el?',
  'wall.keys.preset.offerAutocadOn': 'Porniți modul AutoCAD',
  'wall.keys.preset.offerLater': 'Nu acum',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
