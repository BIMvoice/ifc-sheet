/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keys `locales/ro.test.ts` requires Romanian for: the drafting standards dialog's layers, text styles and dimension
 * styles (#513), every key of its English file. Not the dialog's other tabs (`standards.tab.types`, `.symbols`,
 * `.library`, `.cad`).
 */
import { draftingStandardsEn } from '../catalogues/drafting-standards.en';

export const keys: readonly string[] = Object.keys(draftingStandardsEn);
