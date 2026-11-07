/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** What the command line says after a section is drawn in IfcSheet, which has no Project Navigator (#653). */
export const sectionCreatedDocsEn = {
  'drafting.msg.sectionCreatedSheet': 'Section created — open a sheet and pick it under “Choose what to place…” to put it on the paper.',
} as const satisfies Record<string, TranslationValue>;
