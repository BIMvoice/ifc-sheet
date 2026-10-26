/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the Materials section of the project drawer (`wall-materials.en.ts`, `materials.en.ts`). Term choices: `../ro-glossary.md`. */
export const wallMaterialsRo = {
  'materials.cmd': 'Materiale',
  'materials.title': 'Materiale de construcție',
  'materials.hint': 'Cum desenează fiecare material unde îl taie un plan sau o secțiune: hașura, culoarea de umplere de sub ea și grosimea liniilor hașurii. O membrană (o barieră de vapori, o folie, dar și orice strat sub 2 mm, care nu se taie într-o bandă proprie) se desenează ca o linie groasă întreruptă. Unde benzile aceluiași material a două elemente se ating, linia dintre ele dispare, așa că materialul se citește ca unul singur. Se aplică în toate vederile, planșele și fișierele DXF.',
  'materials.none': 'Încă nu există materiale în modelele încărcate. Dați pereților și planșeelor straturi (Tipuri de elemente sau inspectorul de model) sau adăugați unul mai jos.',
  'materials.col.swatch': 'Eșantion',
  'materials.col.name': 'Material',
  'materials.col.hatch': 'Hașura tăieturii',
  'materials.col.scale': 'Scară',
  'materials.col.fill': 'Umplere',
  'materials.col.pen': 'Peniță de hașură',
  'materials.col.membrane': 'Membrană',
  'materials.auto': '(automat)',
  'materials.noHatch': 'Fără',
  'materials.hatchOf': 'Hașura tăieturii pentru {name}',
  'materials.scaleOf': 'Scara hașurii pentru {name}',
  'materials.fillOf': 'Culoarea de umplere pentru {name}',
  'materials.penOf': 'Penița hașurii pentru {name}',
  'materials.membraneOf': '{name} se desenează ca membrană',
  'materials.fillModeOf': 'Umplerea pentru {name}',
  'materials.fill.ifc': 'Culoarea din IFC',
  'materials.fill.none': 'Fără (alb)',
  'materials.fill.own': 'Culoare',
  'materials.pen.hairline': 'Foarte fină',
  'materials.pen.light': 'Fină',
  'materials.pen.medium': 'Medie',
  'materials.pen.heavy': 'Groasă',
  'materials.reset': 'Înapoi la valorile pe care le sugerează numele',
  'materials.newName': 'Numele noului material',
  'materials.add': 'Adăugați',
  'materials.close': 'Închideți',
  'wall.materials.summary': {
    one: '{count} material, modificate: {changed}',
    few: '{count} materiale, modificate: {changed}',
    other: '{count} de materiale, modificate: {changed}',
  },
  'wall.materials.none': 'Încă nu există materiale în modelele încărcate. Deschideți un model ai cărui pereți și planșee au straturi de material.',
  'wall.materials.swatchOf': 'Cum se desenează {name} pe o planșă la scara 1:100',
  'wall.materials.resetOf': 'Readuceți {name} la valorile pe care le sugerează numele',
  'wall.materials.resetAll': 'Readuceți toate la valorile implicite',
  'wall.materials.edited': '(modificat)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
