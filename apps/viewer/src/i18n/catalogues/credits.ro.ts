/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the credit lines in `credits.en.ts`, plus the status bar's
 * "Built on IFClite" link (its English is in `shell-chrome.en.ts`). Product names are
 * not translated. Term choices: `../ro-glossary.md`.
 */
export const creditsRo = {
  'credits.about.builtOn': '{app} este realizat de BIMvoice și construit pe ifc-lite, dezvoltat de LTplus, sub licența MPL-2.0. Nu este afiliat autorilor ifc-lite.',
  'credits.about.ifcliteGithubLink': 'ifc-lite pe GitHub',
  'shellChrome.statusBar.ifcliteLinkLabel': 'Construit pe IFClite →',
  'shellChrome.statusBar.ifcliteAriaLabel': 'Construit pe IFClite — vizitați ifclite.dev pentru documentație și pachete',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
