/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** JOIN (#668): lines that touch end to end become one polyline. */
export const joinLinesEn = {
  'drafting.cmd.join': 'JOIN',
  'drafting.sel.join': 'Join',
  'drafting.msg.joined': 'Joined {count} lines and polylines into {polylines} polyline(s)',
  'drafting.msg.joinLeft': '{count} piece(s) left as they are: their ends are more than {mm} mm from any other end',
  'drafting.msg.joinNone': 'Nothing to join: no two selected lines or open polylines touch end to end (within {mm} mm)',
} as const;
