/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** Arranging schedules on the Wall (#186): the offer to split a schedule that does not fit the paper. */
export const wallArrangeEn = {
  'wall.fitOffer.title': 'Does not fit the paper',
  'wall.fitOffer.body': '{name} takes {pages} sheets at 1:{scale}. Split it into parts that fit, or keep it paging on the following sheets.',
  'wall.fitOffer.keep': 'Keep paging',
  'wall.fitOffer.sideBySide': 'Place parts side by side',
  /** Written in the title of every page of a schedule after the first: "Doors (continued, 2/3)". */
  'schedule.continued': 'continued',
} as const satisfies Record<string, TranslationValue>;
