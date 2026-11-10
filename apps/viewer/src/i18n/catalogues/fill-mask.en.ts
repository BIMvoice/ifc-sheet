/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** FILL (#681): a closed shape made a fully opaque fill that hides what is behind it; its command, its buttons and its messages. */
export const fillMaskEn = {
  'drafting.cmd.fill': 'FILL',
  'drafting.sel.fill': 'Fill white',
  'drafting.sel.fillColour': 'Fill with a colour',
  'drafting.msg.filled': '{count} filled in {colour}',
  'drafting.msg.fillNone': 'Nothing to fill: select a closed polyline, a rectangle or a circle',
  'drafting.msg.fillColour': 'Not a colour: type white, black, red… or #rrggbb',
} as const;
