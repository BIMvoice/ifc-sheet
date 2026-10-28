/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/**
 * Credit lines for the engine IfcSheet is built on, ifc-lite by LTplus: the About
 * tab of the Info dialog. The status bar's own "Built on IFClite" strings are in
 * `shell-chrome.en.ts`.
 */
export const creditsEn = {
  'credits.about.builtOn': '{app} is made by BIMvoice and built on ifc-lite by LTplus, under the MPL-2.0 licence. It is not affiliated with the ifc-lite authors.',
  'credits.about.ifcliteGithubLink': 'ifc-lite on GitHub',
} as const satisfies Record<string, TranslationValue>;
