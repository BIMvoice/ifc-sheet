/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SheetTemplate } from '@bimvoice/ifcsheet';
import type { TranslationKey } from '@/i18n';
import { paperLabel } from '@/project/paper';

/** One literal key per built-in template, so the face-keys gate sees each. A template the person saved is not here and keeps its own name. */
const BUILT_IN_NAME: Readonly<Record<string, TranslationKey>> = {
  'builtin:a1-plans': 'wall.template.a1-plans',
  'builtin:a3-details': 'wall.template.a3-details',
  'builtin:a2-elevations-long': 'wall.template.a2-elevations-long',
  'builtin:a3-schedules': 'wall.template.a3-schedules',
};

/** What a template option reads: its name in the active language, then its paper. */
export function templateOptionLabel(tpl: SheetTemplate, t: (key: TranslationKey) => string): string {
  const key = BUILT_IN_NAME[tpl.id];
  return `${key ? t(key) : tpl.name} (${paperLabel(tpl.paper)})`;
}
