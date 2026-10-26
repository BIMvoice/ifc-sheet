/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readUnitsAndNumbers } from '@bimvoice/ifcsheet/names';
import { optionalField, whenUsable } from './define';

export const unitsAndNumbersField = optionalField('unitsAndNumbers', whenUsable('unitsAndNumbers', readUnitsAndNumbers));
