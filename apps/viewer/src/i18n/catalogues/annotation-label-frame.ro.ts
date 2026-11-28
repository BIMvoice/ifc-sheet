/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `annotation-label-frame.en.ts` (#924). */
export const annotationLabelFrameRo = {
  'label.frame.circle': 'Cerc',
  'label.frame.hexagon': 'Hexagon',
  'label.classFrame.IfcDoor': 'Chenar la uși',
  'label.classFrame.IfcWindow': 'Chenar la ferestre',
  'label.classFrame.same': 'Ca chenarul',
  'label.classFrame.hint': 'Chenarul etichetelor acestui tip pe o ușă sau o fereastră, când diferă de chenarul de mai sus: de exemplu un cerc pentru uși și un hexagon pentru ferestre.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
