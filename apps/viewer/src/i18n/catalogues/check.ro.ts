/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for "What is missing" (`check.en.ts`). The command name CHECKSET is
 * typed by the user and stays as it is. Term choices: `../ro-glossary.md`.
 * The countable nouns carry the "de" Romanian puts before 20 and above in
 * their `other` form, so "{count} {what}" reads "2 uși" and "20 de uși".
 */
export const checkRo = {
  'check.section': 'Ce lipsește',
  'check.count': 'Ce lipsește din set: {count}.',
  'check.none': 'Nu lipsește nimic din set.',
  'check.noSheet': 'Pe nicio planșă',
  'check.cmd': 'CHECKSET',
  'check.fix.noFix': 'Nu există o comandă care să repare aceasta.',
  'check.fix.noPlace': 'Desenul vizat nu a putut fi deschis.',
  'check.fix.drawingFailed': 'Desenul nu a putut fi realizat, deci reparația nu a rulat. Deschide desenul ca să vezi de ce.',
  'check.fix.drawingLate': 'Desenul nu a fost gata la timp, deci reparația nu a rulat. Deschide-l și încearcă din nou.',
  'check.fix.notStarted': 'Reparația nu a pornit: are nevoie de un desen deschis.',
  'check.refresh': 'Verifică setul',
  'check.go': 'Mergi',
  'check.fix': 'Repară cu',
  'check.fixing': 'Se deschide {view} pentru a rula {command}.',
  'check.fixFailed': '{view} nu a putut fi deschisă.',
  'check.msg.line': '{text}',
  'check.msg.unfinished': {
    one: 'Lipsește un element din set (CHECKSET le listează). Emiterea continuă.',
    few: 'Lipsesc {count} elemente din set (CHECKSET le listează). Emiterea continuă.',
    other: 'Lipsesc {count} de elemente din set (CHECKSET le listează). Emiterea continuă.',
  },
  'check.what.door': { one: 'ușă', few: 'uși', other: 'de uși' },
  'check.what.window': { one: 'fereastră', few: 'ferestre', other: 'de ferestre' },
  'check.what.room': { one: 'încăpere', few: 'încăperi', other: 'de încăperi' },
  'check.untaggedOpenings': '{view} de pe {sheet}: {count} {what} fără etichetă.',
  'check.unlabelledRooms': '{view} de pe {sheet}: {count} {what} fără denumire.',
  'check.planNotDrawn': '{view} de pe {sheet} nu a fost încă desenată, deci ușile, ferestrele și încăperile ei nu au fost verificate. Deschideți-o și verificați din nou.',
  'check.planNoDimensions': '{view} de pe {sheet} nu are cote.',
  'check.viewNoLevelMarks': '{view} de pe {sheet} nu are cote de nivel.',
  'check.viewOffSheet': '{view} nu se află pe nicio planșă.',
  'check.emptySheet': 'Planșa {sheet} este goală.',
  'check.titleBlockEmpty': 'Planșa {sheet} nu are „{field}” în cartuș.',
  'check.duplicateNumber': {
    one: 'O planșă are numărul {number}.',
    few: '{count} planșe au numărul {number}.',
    other: '{count} de planșe au numărul {number}.',
  },
  'check.sectionMarkOffSheet': 'Marcajul lui {view} nu se află pe niciun plan aflat pe o planșă.',
  'check.detailOffSheet': '{view} nu se află pe nicio planșă: marcajul ei nu are trimitere la planșă.',
  'check.noSheetShort': 'nicio planșă',
  'check.what.tag': { one: 'Eticheta', few: 'Etichetele', other: 'Etichetele' },
  'check.what.label': { one: 'Denumirea', few: 'Denumirile', other: 'Denumirile' },
  'check.what.dimension': { one: 'Cota', few: 'Cotele', other: 'Cotele' },
  'check.danglingAnnotation': '{what} „{text}” din {view}, pe {sheet}: elementul ei ({element}) nu mai există în model.',
  'check.orphanedOverride': {
    one: '{schedule} pe {sheet}: {count} valoare introdusă pentru {element}, care nu mai există în model.',
    few: '{schedule} pe {sheet}: {count} valori introduse pentru {element}, care nu mai există în model.',
    other: '{schedule} pe {sheet}: {count} de valori introduse pentru {element}, care nu mai există în model.',
  },
  'check.remedy.dropHint': 'Elimină din tabel valorile introduse pentru acest element',
  'check.remedy.delete': 'Șterge',
  'check.remedy.reattach': 'Reatașează',
  'check.remedy.deleteHint': 'Șterge această adnotare din desen',
  'check.remedy.reattachHint': 'Îndreaptă această adnotare spre alt element: mergeți la ea, apoi faceți clic pe element',
  'check.cmd.reattach': 'REATTACH',
  'check.prompt.reattach': 'Faceți clic pe elementul spre care trebuie să indice eticheta sau denumirea selectată:',
  'check.msg.reattached': 'Atașat la element: {count}.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
