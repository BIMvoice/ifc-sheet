/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readHandoverPattern } from '@bimvoice/ifcsheet/handover';
import { defineField, whenUsable } from './define';

export const handoverPatternField = defineField({ key: 'handoverPattern', empty: () => undefined, load: (v) => readHandoverPattern(v), read: whenUsable('handoverPattern', readHandoverPattern) });
