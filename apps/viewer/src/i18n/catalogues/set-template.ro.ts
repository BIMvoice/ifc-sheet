/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `set-template.en.ts` (#21). Term choices: `../ro-glossary.md`. The command names (TAGALL, DIMALL, LEVELALL) stay as typed. */
export const setTemplateRo = {
  'setTemplate.note.skipped.plan': 'Omis la {sheet}: șablonul are un plan pentru nivelul {storey} (0 este nivelul de la parter) și modelul acesta nu are un asemenea nivel.',
  'setTemplate.note.skipped.section': 'Omis la {sheet}: șablonul are secțiunea {place}, iar modelul acesta oferă mai puține secțiuni.',
  'setTemplate.note.skipped.elevation': 'Omis la {sheet}: șablonul are fațada {direction}, iar modelul acesta nu o are.',
  'setTemplate.note.defaulted': 'Nu sunt în șablon; au fost așezate ca în setul automat, pe hârtia și la scara ultimei planșe din seria {series} a șablonului: {names}.',
  'setTemplate.note.unplaced': 'Șablonul nu are nicio planșă din seria {series}, deci acestea au rămas în afara planșelor: {names}.',
  'setTemplate.note.rescaled': '{sheet} este desenată la 1:{used}, nu la 1:{wanted} cât are șablonul: desenele ei nu încap pe hârtie la scara aceea.',
  'setTemplate.note.schedule': 'Șablonul conține tabelul {kind} „{name}”. Aplicația îl adaugă; linia de comandă nu.',
  'setTemplate.note.carried': 'Nu s-a putut citi {what} din șablon și nu a fost aplicat.',
  'setTemplate.dir.south': 'sud',
  'setTemplate.dir.north': 'nord',
  'setTemplate.dir.east': 'est',
  'setTemplate.dir.west': 'vest',
  'setTemplate.what.titleBlockTemplate': 'aspectul cartușului',
  'setTemplate.what.titleBlockParams': 'parametrii cartușului',
  'setTemplate.what.tagFields': 'câmpurile etichetelor',
  'wall.setTemplate.save': 'Salvați ca șablon de set',
  'wall.setTemplate.saveHint': 'Păstrează cum este făcut acest set, nu desenele: un plan pe nivel, fațadele și secțiunile, hârtia și scara fiecărei planșe, numerotarea, tabelele. Aplicat pe alt model, același set apare pentru clădirea aceea.',
  'wall.setTemplate.name': 'Numele șablonului',
  'wall.setTemplate.summary': 'Planșe: {sheets}. Desene găsite după regulă: {slots}. Tabele: {schedules}.',
  'wall.setTemplate.annotations': 'Comenzi de adnotare pe aceste vederi: {commands}.',
  'wall.setTemplate.nothing': 'Nicio vedere în plan, nicio fațadă și nicio secțiune nu este pe o planșă a acestui proiect, deci nu sunt reguli de salvat.',
  'wall.setTemplate.download': 'Salvați {file}',
  'wall.setTemplate.keep': 'Păstrați în acest browser',
  'wall.setTemplate.saved': 'S-a salvat {file}.',
  'wall.setTemplate.kept': 'S-a păstrat în acest browser ca {name}.',
  'wall.setTemplate.new': 'Proiect nou dintr-un șablon de set',
  'wall.setTemplate.pickFile': 'Alegeți un fișier de șablon de set…',
  'wall.setTemplate.keptTitle': 'Păstrate în acest browser',
  'wall.setTemplate.use': 'Folosiți {name}',
  'wall.setTemplate.forget': 'Uitați {name}',
  'wall.setTemplate.armed': 'Șablonul {name} este pregătit. Alegeți modelul: setul lui se face după regulile șablonului.',
  'wall.setTemplate.chooseModel': 'Alegeți modelul (.ifc)…',
  'wall.setTemplate.disarm': 'Nu folosiți șablonul',
  'wall.setTemplate.refused': 'Fișierul nu poate fi folosit ca șablon de set: {detail}',
  'wall.setTemplate.report.title': 'Făcut după șablonul {name}',
  'wall.setTemplate.report.allMet': 'Fiecare regulă a șablonului și-a găsit desenul în acest model.',
  'wall.setTemplate.report.run': 'Șablonul cere și {commands} pe {series}. Rulați-le pe fiecare vedere după ce o deschideți.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
