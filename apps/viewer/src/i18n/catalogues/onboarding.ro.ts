/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for first-use hints, the "?" help menu and its how-to pages (`onboarding.en.ts`). The buttons are named
 * as the Romanian interface names them (`ro-glossary.md`): Panou, planșă, vedere, cartuș.
 */
export const onboardingRo = {
  'onboarding.hint.dismiss': 'Închide acest indiciu',
  'onboarding.hint.viewportResize': 'Trageți de o margine sau de un colț al desenului ales ca să-l redimensionați.',
  'onboarding.hint.orthoOn': 'Ortogonal este pornit: linia rămâne orizontală sau verticală. Apăsați {key} ca să-l opriți.',
  'onboarding.hint.orthoOff': 'Ortogonal este oprit. Apăsați {key}, sau țineți apăsat Ctrl, ca linia să rămână orizontală sau verticală.',
  'onboarding.hint.openView': 'Dublu clic pe un desen ca să desenați în el.',
  'onboarding.hint.openSheet': 'Dublu clic pe o planșă ca s-o deschideți.',

  'onboarding.settings.title': 'Indicii',
  'onboarding.settings.show': 'Arată indiciile de la prima folosire',
  'onboarding.settings.showHint': 'Sfaturi dintr-un rând, care apar acolo unde se aplică o funcție, de pildă redimensionarea unui desen. Dacă le porniți, revin cele închise înainte.',

  'onboarding.menu.label': 'Ajutor',
  'onboarding.menu.shortcuts': 'Scurtături de tastatură',
  'onboarding.menu.howTo': 'Cum se face',
  'onboarding.menu.report': 'Raportați o problemă sau propuneți o funcție',
  'onboarding.menu.github': 'IfcSheet pe GitHub',
  'onboarding.menu.tour': 'Turul panoului',
  'onboarding.menu.hints': 'Indicii, în Setări',

  'onboarding.howto.title': 'Cum se face',
  'onboarding.howto.description': 'Ghiduri scurte, pas cu pas, pentru IfcSheet.',
  'onboarding.howto.back': 'Toate ghidurile',

  'onboarding.howto.open.title': 'Deschideți un model',
  'onboarding.howto.open.step1': 'În bara de sus alegeți Deschide un model și indicați un fișier .ifc. Ca să încercați întâi IfcSheet, alegeți Proiect demonstrativ.',
  'onboarding.howto.open.step2': 'Așteptați cât se citește modelul. Se citește pe dispozitivul dumneavoastră.',
  'onboarding.howto.open.step3': 'Pagina de întâmpinare numără nivelurile, planșele și vederile făcute.',
  'onboarding.howto.open.step4': 'Alegeți Afișează pe panou ca să vedeți setul.',
  'onboarding.howto.open.step5': 'Ca să păstrați lucrul, alegeți Salvează proiectul în bara de sus. Proiect, apoi Deschide, readuce un proiect salvat.',

  'onboarding.howto.hang.title': 'Afișați setul pe panou',
  'onboarding.howto.hang.step1': 'Pe pagina de întâmpinare alegeți Afișează pe panou. Panoul arată toate planșele alăturate.',
  'onboarding.howto.hang.step2': 'Stabiliți scara planurilor, a fațadelor și a secțiunilor cu butoanele 1 : 50, 1 : 100 și 1 : 200 de sus.',
  'onboarding.howto.hang.step3': 'Dublu clic pe o planșă o deschide. Linkul Panou de deasupra planșei vă readuce.',
  'onboarding.howto.hang.step4': 'Într-o planșă, rotița mărește sau micșorează, iar tragerea hârtiei o deplasează.',
  'onboarding.howto.hang.step5': 'Clic pe un desen îl alege, tragerea îl mută, tragerea marginilor sau a colțurilor îl redimensionează.',
  'onboarding.howto.hang.step6': 'Proiect, în bara de sus, listează planșele. + Planșă adaugă una nouă.',

  'onboarding.howto.dimension.title': 'Cotare și etichetare',
  'onboarding.howto.dimension.step1': 'Dublu clic pe o planșă cu planuri, pe panou, o deschide.',
  'onboarding.howto.dimension.step2': 'Alegeți Cotare în coloana din stânga.',
  'onboarding.howto.dimension.step3': 'Faceți clic pe două puncte; continuați să faceți clic și lanțul de cote se prelungește. Fiecare lungime este citită din model.',
  'onboarding.howto.dimension.step4': 'Apăsați Esc, sau alegeți Gata, ca să opriți.',
  'onboarding.howto.dimension.step5': 'Alegeți Etichetă, apoi faceți clic pe o ușă, o fereastră sau o încăpere. Eticheta se completează singură din model.',

  'onboarding.howto.schedules.title': 'Tabele',
  'onboarding.howto.schedules.step1': 'Alegeți Proiect în bara de sus.',
  'onboarding.howto.schedules.step2': 'Derulați până la butoanele care încep cu plus: + Tabel de tâmplărie (uși și ferestre), + Extras de materiale, + Registru de desene, + Cantități pe tipuri, + Finisaje de încăperi, + Tabel de încăperi și arii, + Legendă.',
  'onboarding.howto.schedules.step3': 'Alegeți unul. Se adaugă ca planșă nouă și se deschide imediat.',
  'onboarding.howto.schedules.step4': 'Cifrele lui sunt citite din model, deci îl urmează când modelul se schimbă.',
  'onboarding.howto.schedules.step5': 'Clic pe tabel îl alege: panoul din dreapta stabilește ce arată.',

  'onboarding.howto.titleBlock.title': 'Cartuș',
  'onboarding.howto.titleBlock.step1': 'Deschideți o planșă și alegeți Cartuș, în dreapta sus.',
  'onboarding.howto.titleBlock.step2': 'Fiecare câmp spune de unde vine valoarea lui: din model, sau că nu se află în model.',
  'onboarding.howto.titleBlock.step3': 'Scrieți o valoare într-un câmp ca s-o dați doar pentru această planșă.',
  'onboarding.howto.titleBlock.step4': 'Pentru o valoare care merge pe fiecare planșă, o stabiliți o dată în panoul Proiect, în secțiunea cartușului.',
  'onboarding.howto.titleBlock.step5': 'Modifică macheta, din aceeași secțiune, mută liniile și textele cartușului.',

  'onboarding.howto.export.title': 'Export',
  'onboarding.howto.export.step1': 'O planșă: deschideți-o și alegeți PDF sau DXF, în dreapta sus.',
  'onboarding.howto.export.step2': 'Previzualizare la dimensiunea hârtiei o arată așa cum se va tipări.',
  'onboarding.howto.export.step3': 'Tot setul: alegeți întâi Ce lipsește în bara de sus, ca să vedeți ce mai lipsește planșelor.',
  'onboarding.howto.export.step4': 'Alegeți Emite setul și dați emiterii un nume și o dată.',
  'onboarding.howto.export.step5': 'Alegeți Emite ca PDF, SVG, arhivat sau DXF, arhivat. Listă de planșe (CSV) scrie lista planșelor.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
