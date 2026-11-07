/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The "Star on GitHub" link and the one reminder after the first issued set (#655). */
export const starEn = {
  'star.link': '★ Star on GitHub',
  'star.linkAria': 'Star IfcSheet on GitHub (opens in a new tab)',
  'star.reminder': 'If IfcSheet saved you time, a star on GitHub helps others find it.',
  'star.reminderLink': 'Star on GitHub',
  'star.close': 'Close',
} as const satisfies Record<string, TranslationValue>;
