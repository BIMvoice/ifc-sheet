/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The site plan, key plan and the symbols computed from the model (`siteplan/`). */
export const sitePlanEn = {
  'site.add': 'Site plan',
  'site.addHint': 'The plot, setbacks and coordinates',
  'site.viewName': 'Site plan',
  'site.drawBoundary': 'Draw the plot boundary',
  'site.coordinates.e': 'E {value}',
  'site.coordinates.n': 'N {value}',
  'site.coordinates.x': 'X {value} (local)',
  'site.coordinates.y': 'Y {value} (local)',
  'site.keyPlan.add': 'Add a key plan',
  'site.keyPlan.label': 'Key plan',
  'site.balance.title': 'Site balance',
  'site.balance.plot': 'Plot area',
  'site.balance.noPlot': 'no plot boundary drawn',
  'site.balance.built': 'Built area (Ac)',
  'site.balance.gross': 'Gross floor area (Ad)',
  'site.balance.grossForCut': 'Ad for CUT',
  'site.balance.pot': 'POT (Ac / plot area)',
  'site.balance.cut': 'CUT (Ad for CUT / plot area)',
  'site.balance.area': '{value} m²',
  'site.balance.percent': '{value} %',
} as const satisfies Record<string, TranslationValue>;
