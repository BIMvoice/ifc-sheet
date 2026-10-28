/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A readiness finding in words: what is missing, and what is weaker for it. */

import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { getLocale, resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import type { ReadinessFinding } from './readiness';

/** The finding's numbers written in the language of the sheet ("123,4 m²", "12 %"); the finding itself keeps them as numbers. */
function written(f: ReadinessFinding): ReadinessFinding['params'] {
  if (f.kind === 'ruralArea' || f.kind === 'ruralAreaAtLeast') return { ...f.params, area: sheetNumber(getLocale(), Number(f.params.area), 1), max: sheetNumber(getLocale(), Number(f.params.max), 0) };
  if (f.kind !== 'estimatedAreas') return f.params;
  return { ...f.params, area: sheetNumber(getLocale(), Number(f.params.area), 1), share: sheetNumber(getLocale(), Number(f.params.share), 0) };
}

export const describeMissing = (f: ReadinessFinding): string => resolve(f.key as TranslationKey, written(f));
export const describeEffect = (f: ReadinessFinding): string => resolve(f.effectKey as TranslationKey, written(f));
