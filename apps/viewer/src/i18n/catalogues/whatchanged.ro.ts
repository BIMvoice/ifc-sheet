/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for "What changed" (`whatchanged.en.ts`). The command name WHATCHANGED stays as typed. Term choices: `../ro-glossary.md`. */
export const whatChangedRo = {
  'whatchanged.cmd': 'WHATCHANGED',
  'whatchanged.msg.line': '{text}',
  'whatchanged.noModel': 'Nu este încărcat niciun model de comparat.',
  'whatchanged.loading': 'Modelul se încarcă încă. Rulați din nou WHATCHANGED când s-a terminat.',
  'whatchanged.busy': 'WHATCHANGED rulează deja.',
  'whatchanged.noBaseline': 'Proiectul nu avea o stare anterioară a modelului cu care să compare, așa că modelul de acum este înregistrat ca referință. Încărcați noua versiune, apoi rulați din nou WHATCHANGED.',
  'whatchanged.against': {
    one: 'Comparat cu modelul de referință: un element s-a modificat în model.',
    few: 'Comparat cu modelul de referință: {count} elemente s-au modificat în model.',
    other: 'Comparat cu modelul de referință: {count} de elemente s-au modificat în model.',
  },
  'whatchanged.sheet': { one: '{number}: {count} modificare', few: '{number}: {count} modificări', other: '{number}: {count} de modificări' },
  'whatchanged.sheetNone': '{number}: nicio modificare.',
  'whatchanged.nothing': 'Nu s-a modificat nimic din ce arată planșele.',
  'whatchanged.item': '  {name} ({class}): {what}',
  'whatchanged.annotationLost': '  În {view}: o adnotare la {name}, element care nu mai există în model.',
  'whatchanged.annotationChanged': '  În {view}: o adnotare la {name}; modificare: {what}.',
  'whatchanged.kind.added': 'adăugat',
  'whatchanged.kind.removed': 'eliminat',
  'whatchanged.kind.moved': 'mutat',
  'whatchanged.kind.reshaped': 'remodelat',
  'whatchanged.kind.property': 'modificat în {sets}',
  'whatchanged.kind.propertyUnnamed': 'proprietăți modificate',
  'whatchanged.kind.type': 'tip modificat',
  'whatchanged.clouds': {
    one: 'Pe stratul Revizii se află un nor de revizie. WHATCHANGED CLEAR îl elimină; WHATCHANGED ACCEPT preia această versiune ca referință pentru următoarea.',
    few: 'Pe stratul Revizii se află {count} nori de revizie. WHATCHANGED CLEAR îi elimină; WHATCHANGED ACCEPT preia această versiune ca referință pentru următoarea.',
    other: 'Pe stratul Revizii se află {count} de nori de revizie. WHATCHANGED CLEAR îi elimină; WHATCHANGED ACCEPT preia această versiune ca referință pentru următoarea.',
  },
  'whatchanged.unread': {
    one: 'O vedere este secționată după un plan care nu este paralel cu o axă; modificările ei nu sunt listate.',
    few: '{count} vederi sunt secționate după un plan care nu este paralel cu o axă; modificările lor nu sunt listate.',
    other: '{count} de vederi sunt secționate după un plan care nu este paralel cu o axă; modificările lor nu sunt listate.',
  },
  'whatchanged.cleared': {
    one: 'S-a eliminat un nor de revizie.',
    few: 'S-au eliminat {count} nori de revizie.',
    other: 'S-au eliminat {count} de nori de revizie.',
  },
  'whatchanged.accepted': {
    one: 'Modelul de acum este referința cu care se compară versiunile următoare. S-a eliminat un nor de revizie.',
    few: 'Modelul de acum este referința cu care se compară versiunile următoare. S-au eliminat {count} nori de revizie.',
    other: 'Modelul de acum este referința cu care se compară versiunile următoare. S-au eliminat {count} de nori de revizie.',
  },
  'whatchanged.usage': 'WHATCHANGED primește nimic, CLEAR sau ACCEPT, nu „{arg}”.',
  'whatchanged.failed': 'WHATCHANGED s-a oprit: {reason}',
  'whatchanged.layer': 'Revizii',
  'whatchanged.ui.open': 'Ce s-a modificat',
  'whatchanged.ui.title': 'Ce s-a modificat',
  'whatchanged.ui.close': 'Închide',
  'whatchanged.ui.intro': 'Încărcați o versiune nouă a modelului, iar fiecare planșă marchează doar ce s-a modificat în ea.',
  'whatchanged.ui.loadVersion': 'Încarcă o versiune nouă a acestui model',
  'whatchanged.ui.loadingVersion': 'Se încarcă versiunea nouă…',
  'whatchanged.ui.versionFailed': 'Versiunea nouă nu a putut fi încărcată: {reason}',
  'whatchanged.ui.compare': 'Arată ce s-a modificat',
  'whatchanged.ui.clear': 'Elimină norii',
  'whatchanged.ui.accept': 'Folosește acest model ca referință',
  'whatchanged.ui.summary': {
    one: 'Un element al modelului s-a modificat',
    few: '{count} elemente ale modelului s-au modificat',
    other: '{count} de elemente ale modelului s-au modificat',
  },
  'whatchanged.ui.sheetRow': { one: '{number}: {count} modificare', few: '{number}: {count} modificări', other: '{number}: {count} de modificări' },
  'whatchanged.ui.sheetsUnchanged': { one: 'O planșă nemodificată', few: '{count} planșe nemodificate', other: '{count} de planșe nemodificate' },
  'whatchanged.ui.unchanged': 'Nu s-a modificat nimic din ce arată planșele.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
