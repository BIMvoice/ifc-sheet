/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the layer print flag, the line types editor and the per-element line overrides of `drafting-standards.en.ts`. Term choices: `../ro-glossary.md`. */
export const draftingStandardsRo = {
  'standards.layer.print': 'Tipărire',
  'standards.layer.printHint': 'Un strat care nu se tipărește rămâne pe ecran și în DXF (ca strat netipărit) și lipsește din SVG-ul și din PDF-ul planșei.',
  'standards.lineTypes.title': 'Tipuri de linie',
  'standards.lineTypes.hint': 'Tiparele dumneavoastră de linie întreruptă, în milimetri pe hârtie: segment, pauză, segment, pauză (un segment de 0 este un punct). Straturile și liniile desenate le aleg din lista Tip de linie.',
  'standards.lineTypes.add': 'Tip de linie nou',
  'standards.lineTypes.name': 'Numele tipului de linie',
  'standards.lineTypes.pattern': 'Tipar (mm)',
  'standards.lineTypes.invalid': 'Folosiți perechi de lungimi, segment apoi pauză, cu pauze mai mari de 0 (de exemplu 6 2 1 2).',
  'standards.lineTypes.delete': 'Ștergeți tipul de linie {name}',
  'standards.lineTypes.newName': 'Tip de linie {n}',
  'standards.el.color': 'Culoare',
  'standards.el.weight': 'Grosime (mm)',
  'standards.el.lineType': 'Tip de linie',
  'standards.el.byLayer': 'După strat',
  'standards.el.line': 'Linie',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
