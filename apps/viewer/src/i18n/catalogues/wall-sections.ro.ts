/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the summaries of the closed card sections (`wall-sections.en.ts`). Term choices: `../ro-glossary.md`. */
export const wallSectionsRo = {
  'wall.section.sub.none': 'Nesplitat încă',
  'wall.section.sub.parts': { one: '{count} subtabel', few: '{count} subtabele', other: '{count} de subtabele' },
  'wall.section.sub.duplicates': 'dubluri',
  'wall.section.sub.gaps': 'goluri',
  'wall.section.sub.kinds': 'feluri: {list}',
  'wall.section.sub.levels': '{count} din {total} niveluri',
  'wall.section.sub.types': '{count} din {total} tipuri',
  'wall.section.sub.all': 'Păstrează tot',
  'wall.section.content.default': 'În ordinea din model',
  'wall.section.content.hidden': { one: '{count} rând ascuns', few: '{count} rânduri ascunse', other: '{count} de rânduri ascunse' },
  'wall.section.content.reordered': 'rânduri mutate',
  'wall.section.content.sorted': 'sortat după {by}',
  'wall.section.content.sortedReverse': 'sortat după {by}, invers',
  'wall.section.content.by.mark': 'poziție',
  'wall.section.content.by.size': 'dimensiune',
  'wall.section.content.by.kind': 'fel',
  'wall.section.content.by.count': 'număr',
  'wall.section.content.sequence': 'poziții în ordinea afișată',
  'wall.section.content.typeStart': 'tipuri de la {n}',
  'wall.section.content.elementStart': 'elemente de la {n}',
  'wall.section.content.noElevation': 'fără simboluri de fațadă',
  'wall.section.content.noPlan': 'fără simboluri de plan',
  'wall.section.filter.none': 'Nefiltrat',
  'wall.section.filter.classes': 'clase {list}',
  'wall.section.filter.predefined': 'tipuri predefinite {list}',
  'wall.section.filter.nothing': 'niciuna',
  'wall.section.text.none': 'Niciunul',
  'wall.section.text.rows': { one: '{count} rând', few: '{count} rânduri', other: '{count} de rânduri' },
  'wall.section.text.orphans': { one: '{count} text pentru un tip care nu mai e în model', few: '{count} texte pentru tipuri care nu mai sunt în model', other: '{count} de texte pentru tipuri care nu mai sunt în model' },
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
