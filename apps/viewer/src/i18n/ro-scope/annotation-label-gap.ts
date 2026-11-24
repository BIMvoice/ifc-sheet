/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What `locales/ro.test.ts` requires Romanian for in the label type's gap (#842): every key of its English file. */
import { annotationLabelGapEn } from '../catalogues/annotation-label-gap.en';

export const keys: readonly string[] = Object.keys(annotationLabelGapEn);
