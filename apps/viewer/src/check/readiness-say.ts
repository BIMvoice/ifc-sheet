/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A readiness finding in words: what is missing, and what is weaker for it. */

import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import type { ReadinessFinding } from './readiness';

export const describeMissing = (f: ReadinessFinding): string => resolve(f.key as TranslationKey, f.params);
export const describeEffect = (f: ReadinessFinding): string => resolve(f.effectKey as TranslationKey, f.params);
