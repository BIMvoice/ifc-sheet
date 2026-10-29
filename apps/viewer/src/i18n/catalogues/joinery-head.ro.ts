/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
import type { joineryHeadEn } from './joinery-head.en';

/** Ce spune formularul tipului despre partea de sus a unui tip de ușă sau fereastră și despre proprietățile scrise pentru el (#448). Engleză: `joinery-head.en.ts`. */
export const joineryHeadRo: Record<keyof typeof joineryHeadEn, TranslationValue> = {
  'joinery.head.title': 'Partea de sus',
  'joinery.head.square': 'Dreaptă',
  'joinery.head.round': 'Semicirculară',
  'joinery.head.segmental': 'În arc de cerc',
  'joinery.head.pointed': 'Ogivală',
  'joinery.head.rise': 'Săgeata arcului (mm)',
  'joinery.head.riseDefault': 'Săgeată (mm), goală pentru valoarea implicită',
  'joinery.props.title': 'Proprietăți adăugate manual',
  'joinery.props.hint': 'Rămân în proiect, nu se scriu în IFC. Un tabel o arată ca rând: «Adăugați o coloană» pe cartela lui, setul «Typed for the type».',
  'joinery.props.name': 'Nume',
  'joinery.props.value': 'Valoare',
  'joinery.props.add': 'Adaugă o proprietate',
  'joinery.props.remove': 'Elimină {name}',
};
