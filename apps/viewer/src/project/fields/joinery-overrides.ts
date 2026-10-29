/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readJoineryOverrides, type JoineryCellOverride } from '@bimvoice/ifcsheet';
import { optionalField, whenUsable } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The cells of the joinery schedules typed over the model's text from the sheet (#446), by type and row; they apply to that type's cell in every joinery schedule. Absent: none. */
    joineryOverrides?: JoineryCellOverride[];
  }
}

/** Typed cells of the joinery schedules (#446): absent unless the user typed one, so a project without any is saved as it always was. */
export const joineryOverridesField = optionalField('joineryOverrides', whenUsable('joineryOverrides', readJoineryOverrides));
