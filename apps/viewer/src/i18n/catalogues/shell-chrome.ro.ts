/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `shell-chrome` (#526). Term choices: `../ro-glossary.md`. */
export const shellChromeRo = {
  'shellChrome.panelGroups.author': 'Autor',
  'shellChrome.panelGroups.authorDescription': 'Desenați și editați elemente de clădire în spațiul de lucru Model.',
  'shellChrome.panelGroups.automate': 'Automatizare',
  'shellChrome.panelGroups.automateDescription': 'Rulați scripturi, fluxuri și extensii.',
  'shellChrome.panelGroups.check': 'Verificare',
  'shellChrome.panelGroups.checkDescription': 'Revizuiți probleme, modificări, validări și diferențe între modele.',
  'shellChrome.panelGroups.coordinate': 'Coordonare',
  'shellChrome.panelGroups.coordinateDescription': 'Găsiți informații despre model, surse partajate, zone și amplasare.',
  'shellChrome.panelGroups.quantify': 'Cantități',
  'shellChrome.panelGroups.quantifyDescription': 'Măsurați, numărați, centralizați în tabele și estimați lucrările modelului.',
  'shellChrome.panelGroups.site': 'Amplasament',
  'shellChrome.panelGroups.siteDescription': 'Explorați contextul amplasamentului și pregătiți desene sau prezentări.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
