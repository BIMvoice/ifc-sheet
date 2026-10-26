/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The room schedule's perimeter column and the area summary under it (#42): Su, Sc and Sd per level and for the building. */
export const roomSummaryEn = {
  'roomSum.perimeter': 'Perimeter m',
  'roomSum.note.perimeter': 'Perimeter: the outline of the footprint of the room\'s geometry, the one its area falls back on; – where the room has no geometry. The model\'s own Perimeter quantity is not read.',
  'roomSum.heading': 'Area summary (Su, Sc, Sd)',
  'roomSum.level': 'Level',
  'roomSum.su': 'Su m²',
  'roomSum.sc': 'Sc m²',
  'roomSum.sd': 'Sd m²',
  'roomSum.building': 'Total building',
  'roomSum.note.defs': 'Su = usable area (Au): the sum of the rooms\' areas. Sc = built area (Ac): the footprint of the level containing {mark}, measured to the outer face of the external walls. Sd = gross floor area (Ad): the sum of the built areas of all levels, basements included; a level\'s line is its own built area. The same figures as the urban indicators sheet.',
  'roomSum.note.atLeast': '≥ marks a level where walls, columns or slabs gave no outline: its built area is at least that much.',
} as const satisfies Record<string, TranslationValue>;
