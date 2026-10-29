/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `project-package` (#526). Term choices: `../ro-glossary.md`. */
export const projectPackageRo = {
  'projectPackage.autosaveFailed': 'Desenele dvs. nu se salvează automat: browserul a refuzat să le stocheze ({detail}). Salvați proiectul într-un fișier pentru a vă păstra munca.',
  'projectPackage.autosaveImagesFailed': 'Starea modelului sau o captură 3D nu a putut fi păstrată la salvarea automată. Salvați proiectul într-un fișier pentru a o păstra.',
  'projectPackage.autosaveTooNew': 'Salvarea automată pentru aceste modele a fost scrisă de o versiune mai nouă a IfcSheet. Această versiune o lasă neatinsă, deci ce faceți aici nu se salvează automat. Salvați proiectul într-un fișier pentru a vă păstra munca.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
