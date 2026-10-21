/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the Wall texts the features merged alongside the Romanian
 * interface brought: the demo project, scales per group and per drawing,
 * legends, and the local-only privacy notice. Term choices: `../ro-glossary.md`.
 */
export const featuresRo = {
  'settings.privacy.toastDisclosureLocal': '{app} păstrează un jurnal de acțiuni pe dispozitivul dumneavoastră. Această versiune nu trimite date de analiză.',
  'wall.demo': 'Sau încercați proiectul demonstrativ: un bloc de locuințe, parter plus patru etaje',
  'wall.group.legends': 'Legende',
  'wall.elevationScale': 'Scara fațadelor',
  'wall.sectionScale': 'Scara secțiunilor',
  'wall.shell.demo': 'Proiect demonstrativ',
  'wall.vp.scaleOther': 'Alta…',
  'wall.vp.scaleTyped': 'Scara 1 : (Enter pentru a aplica)',
  'wall.vp.scaleBad': 'Introduceți un număr întreg de la 1 la {max}, de exemplu 33 sau 1:33.',
  'wall.vp.overrun': 'La 1 : {scale} acest desen are {w} × {h} mm, mai mult decât zona de desen a planșei ({aw} × {ah} mm).',
  'wall.vp.useScale': 'Folosiți 1 : {scale}, încape',
  'wall.legend.add': '+ Legendă',
  'wall.legend.nameLabel': 'Nume',
  'wall.legend.listsLabel': 'Listează',
  'wall.legend.scopeLabel': 'Acoperă',
  'wall.legend.scopeProject': 'Întregul proiect',
  'wall.legend.scopeSheet': 'Această planșă, {number}',
  'wall.legend.create': 'Creează legenda',
  'wall.legend.createPlace': 'Creează legenda și așaz-o pe {number}',
  'wall.legend.cancel': 'Anulează',
  'wall.legend.needOne': 'Alegeți cel puțin un lucru pe care să îl listeze.',
  'wall.legend.cardTitle': 'Titlul legendei',
  'wall.legend.columns': 'Coloane',
  'wall.legend.placed': 'Așezată pe {number}.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
