/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What `locales/ro.test.ts` requires Romanian for in the joinery schedules (#475): every `joinery.` and `joinerySymbol.`
 * key (the frozen list held only `joinery.op.`), and the schedule's controls, whose `schedule.` prefix also holds the 4D
 * schedule's keys, which the face does not reach.
 */
export const prefixes: readonly string[] = ['joinery.', 'joinerySymbol.'];

export const keys: readonly string[] = [
  'schedule.count', 'schedule.empty', 'schedule.folder', 'schedule.kind', 'schedule.new', 'schedule.newName', 'schedule.number', 'schedule.numberHint', 'schedule.numbered', 'schedule.scale', 'schedule.zoomIn', 'schedule.zoomOut', 'typeQty.sheet', 'typeQty.empty', 'typeQty.noQtoNote',
];
