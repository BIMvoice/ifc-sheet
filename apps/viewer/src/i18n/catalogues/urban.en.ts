/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';
/** The permit's areas and urban indicators (#76). Ac, Ad, Au, POT and CUT are the Romanian abbreviations a permit uses. */
export const urbanEn = {
  'urban.newName': 'Areas and urban indicators',
  'urban.add': '+ Areas and indicators (Ac, Ad, Au, POT, CUT)',
  'urban.level': 'Level',
  'urban.elevation': 'Elevation m',
  'urban.built': 'Built area m²',
  'urban.useful': 'Useful area m²',
  'urban.belowGround': '{name} (basement, not in Ad)',
  'urban.category': 'Room category',
  'urban.area': 'Area m²',
  'urban.ac': 'Ac (built area)',
  'urban.ad': 'Ad (gross developed area)',
  'urban.au': 'Au (useful area)',
  'urban.site': 'Site area',
  'urban.pot': 'POT (Ac / site)',
  'urban.cut': 'CUT (Ad / site)',
  'urban.siteArea': 'Site area (m²)',
  'urban.siteArea.help': 'POT and CUT are measured on it. Leave empty to use the model\'s site area.',
  'urban.siteArea.fromModel': 'model: {area} m²',
  'urban.siteArea.none': 'not stated by the model',
  'urban.assumedInterior': 'No slab or room on {levels}: every enclosed space there was counted as built.',
  'urban.atLeast': '≥ {value}',
  'urban.unmeasured': 'Ac/Ad may be low: {count} element(s) on {level} could not be measured.',
  'urban.empty': 'No storey of the loaded models has walls, columns or slabs to measure.',
} as const satisfies Record<string, TranslationValue>;
