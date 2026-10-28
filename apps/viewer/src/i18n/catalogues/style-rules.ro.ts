/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Asocierea după clasă și material a unui șablon de vedere, în lista șabloanelor de vedere (#31). */
export const styleRulesRo = {
  'wall.rules.title': 'Asociere după clasă și material',
  'wall.rules.hint': 'Desenează o clasă IFC sau un material de construcție în felul lui, în fiecare desen care urmează acest șablon. O regulă de clasă stabilește linia și umplutura; una de material, umplutura și hașura secțiunii. Grafica proprie a unui desen rămâne mai tare. Mai multe nume se separă cu ;.',
  'wall.rules.empty': 'Nimic asociat încă.',
  'wall.rules.class': 'Clasă IFC',
  'wall.rules.material': 'Material',
  'wall.rules.swatch': 'Cum se desenează {name}',
  'wall.rules.matches': 'Nume de {kind}, separate cu ;',
  'wall.rules.weight': 'Grosimea tăieturii pentru {name}',
  'wall.rules.fill': 'Umplutura pentru {name}',
  'wall.rules.fillClear': 'Fără umplutură pentru {name}',
  'wall.rules.line': 'Culoarea liniei pentru {name}',
  'wall.rules.lineClear': 'Fără culoare de linie pentru {name}',
  'wall.rules.hatch': 'Hașura pentru {name}',
  'wall.rules.hatchNone': 'Fără hașură',
  'wall.rules.remove': 'Șterge regula pentru {name}',
  'wall.rules.addKind': 'Tipul regulii',
  'wall.rules.addName': 'Clasa sau materialul de asociat',
  'wall.rules.add': 'Adaugă regula',
  'wall.rules.unmapped': 'În model, neasociate',
  'wall.rules.allMapped': 'Tot ce e în modelele încărcate este asociat.',
  'wall.rules.noModel': 'Încarcă un model ca să vezi clasele și materialele lui.',
  'wall.rules.mapIt': 'Asociază {kind} {name}',
} as const satisfies Record<string, TranslationValue>;
