/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The draw order of drafted elements (#682): BRINGTOFRONT, SENDTOBACK, their buttons on the selection's bar, and a layer's order. */
export const drawOrderEn = {
  'drafting.cmd.bringToFront': 'BRINGTOFRONT',
  'drafting.cmd.sendToBack': 'SENDTOBACK',
  'drafting.sel.front': 'Bring to front',
  'drafting.sel.back': 'Send to back',
  'drafting.msg.orderFront': '{count} brought to front',
  'drafting.msg.orderBack': '{count} sent to back',
  'drafting.msg.orderKept': 'Nothing to move: the selection is already there',
  'standards.layer.order': 'Order',
  'standards.layer.orderHint': 'A layer with a higher number draws above a layer with a lower one',
} as const;
