/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the rest of the IfcSheet face: the privacy notice and the toast's dismiss label. Term choices: `../ro-glossary.md`. */
export const faceRo = {
  'settings.privacy.toastDisclosure': '{app} păstrează un jurnal al acțiunilor pe dispozitivul dumneavoastră. Versiunea găzduită trimite și statistici anonime de utilizare, dacă nu le dezactivați din Setările de confidențialitate.',
  'viewerShell.toast.dismiss': 'Închide notificarea',
  'settings.privacy.toastAction': 'Setări de confidențialitate',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
