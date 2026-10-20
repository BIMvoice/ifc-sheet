/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The words for a project file that could not be opened: a newer file's message is its own, anything else names the problem. */

import type { TranslationKey } from '@/i18n';
import type { TranslationParameters } from '@/i18n/types';
import { ProjectFileTooNewError } from './project-migrations';

type Translate = (key: TranslationKey, params?: TranslationParameters) => string;

export function projectOpenErrorText(err: unknown, t: Translate): string {
  if (err instanceof ProjectFileTooNewError) return t(err.translatable.labelKey, err.translatable.params);
  return t('projectNavigator.error.import', { detail: err instanceof Error ? err.message : String(err) });
}
