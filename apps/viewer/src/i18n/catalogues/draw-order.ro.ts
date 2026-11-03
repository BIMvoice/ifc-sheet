/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `draw-order.en.ts` (#682). */
export const drawOrderRo = {
  'drafting.cmd.bringToFront': 'BRINGTOFRONT',
  'drafting.cmd.sendToBack': 'SENDTOBACK',
  'drafting.sel.front': 'Adu în față',
  'drafting.sel.back': 'Trimite în spate',
  'drafting.msg.orderFront': '{count} aduse în față',
  'drafting.msg.orderBack': '{count} trimise în spate',
  'drafting.msg.orderKept': 'Nimic de mutat: selecția e deja acolo',
  'standards.layer.order': 'Ordine',
  'standards.layer.orderHint': 'Un strat cu număr mai mare se desenează deasupra unuia cu număr mai mic',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
