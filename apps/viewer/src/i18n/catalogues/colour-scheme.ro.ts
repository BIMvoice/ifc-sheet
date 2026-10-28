/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `colour-scheme.en.ts`. Term choices: `../ro-glossary.md`. */
export const colourSchemeRo = {
  'legend.category.colours': 'Culori după valoare',
  'wall.scheme.title': 'Colorare după proprietate',
  'wall.scheme.summaryOff': 'Necolorată',
  'wall.scheme.summary': 'După {property}',
  'wall.scheme.start': 'Colorează vederea după o proprietate',
  'wall.scheme.target': 'Colorează',
  'wall.scheme.target.rooms': 'Încăperile',
  'wall.scheme.target.elements': 'Elementele',
  'wall.scheme.classes': 'Elemente din clasa',
  'wall.scheme.classesAll': 'Toate clasele',
  'wall.scheme.property': 'Proprietate',
  'wall.scheme.propertyPick': 'Alege o proprietate',
  'wall.scheme.propertyType': 'Sau scrie Pset.Proprietate, ori un atribut precum LongName',
  'wall.scheme.palette': 'Paletă',
  'wall.scheme.palette.tol-light': 'Discretă, accesibilă daltoniștilor',
  'wall.scheme.palette.okabe-ito': 'Intensă, accesibilă daltoniștilor',
  'wall.scheme.values': 'Valorile din această vedere',
  'wall.scheme.valueCount': { one: 'o valoare', few: '{count} valori', other: '{count} de valori' },
  'wall.scheme.colourOf': 'Culoarea pentru {value}',
  'wall.scheme.reset': 'Culoare automată',
  'wall.scheme.noValues': 'Nicio încăpere sau niciun element din această vedere nu are valoare pentru această proprietate.',
  'wall.scheme.unreadable': 'Această proprietate nu poate fi citită. Scrie Pset.Proprietate, ori un atribut precum LongName.',
  'wall.scheme.addLegend': 'Adaugă legendă',
  'wall.scheme.legendOnSheet': 'Legenda este pe această planșă',
  'wall.scheme.remove': 'Renunță la colorare',
  'wall.scheme.legendTitle': 'Titlul legendei',
  'wall.scheme.attr.LongName': 'Denumire încăpere',
  'wall.scheme.attr.Name': 'Denumire',
  'wall.scheme.attr.ObjectType': 'Tip',
  'wall.scheme.attr.Description': 'Descriere',
  'wall.scheme.attr.PredefinedType': 'Tip predefinit',
  'wall.scheme.attr.Tag': 'Etichetă',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
