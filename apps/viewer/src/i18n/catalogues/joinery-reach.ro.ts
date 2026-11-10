/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
import type { joineryReachEn } from './joinery-reach.en';

/** Ce spune fața IfcSheet pentru a ajunge la configuratorul de uși și ferestre (#656). Engleză: `joinery-reach.en.ts`. Termeni: `../ro-glossary.md`. */
export const joineryReachRo: Record<keyof typeof joineryReachEn, TranslationValue> = {
  'joinery.reach.open': 'Deschidere și simbol',
  'joinery.reach.eyebrow': 'Ușă sau fereastră',
  'joinery.reach.title': 'Deschidere și simbol',
  'joinery.reach.close': 'Închide',
  'joinery.reach.untyped': 'Acest element nu are un tip IFC pe care să se păstreze o deschidere, canaturile sau un luminator, iar modelul nu se modifică. Alegeți simbolul mai sus.',
  'joinery.reach.draw.title': 'Desenați pe un tip',
  'joinery.reach.draw.type': 'Tip',
  'joinery.reach.draw.view': 'Vedere',
  'joinery.reach.draw.open': 'Deschide pentru a desena',
  'joinery.reach.draw.cutting': 'Se taie vederile tipurilor…',
  'joinery.reach.draw.none': 'Niciun tip din acest tabel nu are încă vederi pe care să se deseneze. Selectați o ușă sau o fereastră într-un plan și dați-i deschiderea cu „Deschidere și simbol”.',
};
