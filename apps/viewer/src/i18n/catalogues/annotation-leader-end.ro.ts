/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for `annotation-leader-end.en.ts` (#842). "Linie de indicație" is the glossary's leader; the three ends are the
 * words a dimension style's ends already use (`standards.dim.arrow.*`).
 */
export const annotationLeaderEndRo = {
  'label.leaderEnd': 'Capătul liniei de indicație',
  'label.leaderEnd.arrow': 'Săgeată',
  'label.leaderEnd.dot': 'Punct',
  'label.leaderEnd.none': 'Niciunul',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
