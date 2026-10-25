/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the issue date and what changed since the last issue (`issue-changes.en.ts`). Term choices: `../ro-glossary.md`. */
export const issueChangesRo = {
  'issue.date': 'Data emiterii',
  'issue.date.hint': 'Se tipărește ca dată în indicatorul fiecărei planșe din această emitere, în lista desenelor și în denumirile fișierelor. Dacă rămâne goală, e data de azi.',
  'issue.changes.title': 'De la „{name}”',
  'issue.changes.first': 'Aceasta este prima emitere, deci nu are cu ce fi comparată.',
  'issue.changes.unknown': 'Emiterea anterioară nu are amprentă; modificările nu pot fi listate.',
  'issue.changes.none': 'Nicio planșă nu a fost adăugată, scoasă sau modificată de la „{name}”.',
  'issue.changes.added': { one: 'Adăugată ({count}): {sheets}', few: 'Adăugate ({count}): {sheets}', other: 'Adăugate ({count}): {sheets}' },
  'issue.changes.removed': { one: 'Scoasă ({count}): {sheets}', few: 'Scoase ({count}): {sheets}', other: 'Scoase ({count}): {sheets}' },
  'issue.changes.changed': { one: 'Modificată ({count}): {sheets}', few: 'Modificate ({count}): {sheets}', other: 'Modificate ({count}): {sheets}' },
  'issue.changes.note': 'Compară ce păstrează proiectul pentru fiecare planșă: setările ei, vederile și desenele de pe ea și reviziile. O schimbare în model este listată de „Ce s-a modificat”.',
  'issue.changes.bump': { one: 'Adaugă o revizie acestei planșe', few: 'Adaugă o revizie acestor {count} planșe', other: 'Adaugă o revizie acestor {count} de planșe' },
  'issue.changes.bumpHint': {
    one: 'A fost modificată fără o revizie nouă. Adaugă o revizie, cu data emiterii.',
    few: 'Au fost modificate fără o revizie nouă. Adaugă o revizie, cu data emiterii, fiecăreia.',
    other: 'Au fost modificate fără o revizie nouă. Adaugă o revizie, cu data emiterii, fiecăreia.',
  },
  'issue.changes.column': 'Modificare',
  'issue.changes.cell.new': 'Nouă',
  'issue.changes.cell.changed': 'Modificată',
  'issue.changes.cell.removed': 'Scoasă',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
