/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the toasts of the exports the command palette starts and of opening a file, both on IfcSheet's
 * face. Term choices: `../ro-glossary.md`.
 */
export const exportToastsRo = {
  'exportToast.unknownError': 'Eroare necunoscută',
  'exportToast.table.entities': 'entități',
  'exportToast.table.properties': 'proprietăți',
  'exportToast.table.quantities': 'cantități',
  'exportToast.table.spatial': 'ierarhia spațială',
  'exportToast.activeModelOnly': {
    one: 'doar modelul activ, încă {count} model încărcat nu este inclus',
    few: 'doar modelul activ, încă {count} modele încărcate nu sunt incluse',
    other: 'doar modelul activ, încă {count} de modele încărcate nu sunt incluse',
  },
  'exportToast.csvDone': 'CSV exportat ({table}){note}',
  'exportToast.csvFailed': 'Exportul CSV a eșuat: {reason}',
  'exportToast.jsonDone': {
    one: 'S-a exportat o entitate ca JSON{note}',
    few: 'S-au exportat {count} entități ca JSON{note}',
    other: 'S-au exportat {count} de entități ca JSON{note}',
  },
  'exportToast.jsonFailed': 'Exportul JSON a eșuat: {reason}',
  'exportToast.screenshotDone': 'Captura de ecran a fost salvată',
  'exportToast.screenshotFailed': 'Captura de ecran a eșuat',
  'fileLoad.toast.changedSinceCached': '„{name}” s-a schimbat de când a fost păstrat în memoria locală. Se reîncarcă fișierul curent.',
  'fileLoad.toast.tooDetailed': '„{name}” este prea detaliat pentru acest dispozitiv. Se reîncearcă cu mai puține detalii…',
  'fileLoad.toast.pointCloudsKeepRaw': 'Norii de puncte încărcați înaintea acestui model își păstrează coordonatele brute. Reîncărcați scanarea ca să o aliniați la georeferința modelului.',
  'fileLoad.toast.pointCloudRealignFailed': 'Realinierea norilor de puncte a eșuat; transformările existente ale scanărilor au fost restaurate.',
  'fileLoad.toast.orphanImages': '{names}: nu a fost selectată alături nicio imagine cu același nume.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
