/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { UseTranslationResult } from '@/i18n';
import { ariaKeyShortcuts, shortcutLabel, type KeyCommandId } from '@/lib/commands/shortcut-label';

/**
 * What a control that has a key carries, both from the binding in force for it
 * (the keymap's, or the person's, #166): the tooltip (its name and the key,
 * written for the platform) and `aria-keyshortcuts`, so a screen reader
 * announces the key the tooltip shows. An action with no key has its bare name
 * and announces none.
 */
export function keyProps(t: UseTranslationResult['t'], name: string, id: KeyCommandId): { title: string; 'aria-keyshortcuts'?: string } {
  const keys = shortcutLabel(id);
  if (!keys) return { title: name };
  return { title: t('wall.withKey', { name, keys }), 'aria-keyshortcuts': ariaKeyShortcuts(id) || undefined };
}
