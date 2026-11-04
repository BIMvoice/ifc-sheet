/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Room tags on sections and elevations (#677): what TAGALL says on a view whose plane cuts no room. */
export const sectionRoomTagsEn = {
  'drafting.msg.tagAllNoRoomsCut': 'This view cuts no room, so no room tag was drawn. A section tags the rooms its plane goes through; an exterior elevation sees rooms only from outside.',
  'drafting.msg.tagAllOverLines': {
    one: 'One room tag has no place clear of the lines this view shows, so it lies over one. Move it by hand.',
    other: '{count} room tags have no place clear of the lines this view shows, so they lie over one. Move them by hand.',
  },
} as const satisfies Record<string, TranslationValue>;
