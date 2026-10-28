/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `viewer-shell` (#526). Term choices: `../ro-glossary.md`. */
export const viewerShellRo = {
  'viewerShell.dialog.cancel': 'Anulare',
  'viewerShell.dialog.confirm': 'Confirmați',
  'viewerShell.dialog.confirmTitle': 'Confirmați acțiunea',
  'viewerShell.dialog.promptTitle': 'Introduceți o valoare',
  'viewerShell.dialog.promptValue': 'Valoare',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
