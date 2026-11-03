/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `join-lines.en.ts` (#668). */
export const joinLinesRo = {
  'drafting.cmd.join': 'JOIN',
  'drafting.sel.join': 'Unește',
  'drafting.msg.joined': 'Am unit {count} linii și polilinii în {polylines} polilinie/polilinii',
  'drafting.msg.joinLeft': '{count} piesă/piese lăsate neschimbate: capetele lor sunt la mai mult de {mm} mm de orice alt capăt',
  'drafting.msg.joinNone': 'Nimic de unit: nicio pereche de linii sau polilinii deschise selectate nu se ating cap la cap (în {mm} mm)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
