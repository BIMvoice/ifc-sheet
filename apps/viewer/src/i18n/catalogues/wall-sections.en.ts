/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The one-line summaries a closed section of the schedule's viewport card gives (#290). Romanian: `wall-sections.ro.ts`. */
export const wallSectionsEn = {
  'wall.section.sub.none': 'Not split yet',
  'wall.section.sub.parts': { one: '{count} sub-report', other: '{count} sub-reports' },
  'wall.section.sub.duplicates': 'duplicates',
  'wall.section.sub.gaps': 'gaps',
  'wall.section.sub.kinds': 'kinds: {list}',
  'wall.section.sub.levels': '{count} of {total} storeys',
  'wall.section.sub.types': '{count} of {total} types',
  'wall.section.sub.all': 'Keeps everything',
  'wall.section.content.default': 'As the model lists them',
  'wall.section.content.hidden': { one: '{count} row hidden', other: '{count} rows hidden' },
  'wall.section.content.properties': { one: '{count} row from the model', other: '{count} rows from the model' },
  'wall.section.content.reordered': 'rows reordered',
  'wall.section.content.sorted': 'sorted by {by}',
  'wall.section.content.sortedReverse': 'sorted by {by}, reversed',
  'wall.section.content.by.mark': 'mark',
  'wall.section.content.by.size': 'size',
  'wall.section.content.by.kind': 'kind',
  'wall.section.content.by.count': 'count',
  'wall.section.content.sequence': 'marks in the order shown',
  'wall.section.content.typeStart': 'types from {n}',
  'wall.section.content.elementStart': 'elements from {n}',
  'wall.section.content.noElevation': 'no elevation symbols',
  'wall.section.content.noPlan': 'no plan symbols',
  'wall.section.filter.none': 'Not filtered',
  'wall.section.filter.classes': 'classes {list}',
  'wall.section.filter.predefined': 'predefined types {list}',
  'wall.section.filter.nothing': 'none',
  'wall.section.text.none': 'None',
  'wall.section.text.rows': { one: '{count} row', other: '{count} rows' },
  'wall.section.text.orphans': { one: '{count} text for a type no longer in the model', other: '{count} texts for types no longer in the model' },
} as const satisfies Record<string, TranslationValue>;
