/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
import type { joineryBlockEn } from './joinery-block.en';

/** Ce spune formularul tipului despre un bloc DXF folosit ca simbol în plan al unui tip de ușă sau fereastră (#448). Engleză: `joinery-block.en.ts`. */
export const joineryBlockRo: Record<keyof typeof joineryBlockEn, TranslationValue> = {
  'joinery.block.title': 'Simbol în plan dintr-un bloc DXF',
  'joinery.block.hint': 'Se desenează în plan în locul simbolului generat, potrivit lățimii golului, ca gol cu deschidere stânga și exteriorul spre +Y; un tip cu deschidere dreapta îl oglindește. Rămâne în proiect.',
  'joinery.block.file': 'Fișier DXF',
  'joinery.block.pick': 'Bloc',
  'joinery.block.current': 'Simbol: {name}',
  'joinery.block.remove': 'Elimină simbolul din plan',
  'joinery.block.none': 'Fișierul nu are niciun bloc cu linii, arce sau cercuri.',
  'joinery.block.empty': 'Blocul nu conține nimic ce se poate desena.',
  'joinery.block.millimetres': 'Fișierul nu precizează unitățile: citit în milimetri.',
  'joinery.block.unsupported': 'Nedesenate: {list}.',
  'joinery.block.skipped': 'Omise în altă parte a fișierului: {list}.',
  'joinery.block.unreadable': 'Fișierul nu a putut fi citit ca DXF: {reason}',
  'joinery.block.truncated': 'Blocul e mai mare decât păstrează un simbol; o parte e lăsată deoparte.',
};
