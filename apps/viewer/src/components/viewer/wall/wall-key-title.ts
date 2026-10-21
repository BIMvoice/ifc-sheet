/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { UseTranslationResult } from '@/i18n';
import { ariaKeyShortcuts, shortcutLabel, type KeyCommandId } from '@/lib/commands/shortcut-label';

/**
 * What a control that has a key carries, both from the keymap's row for it: the
 * tooltip (its name and the key, written for the platform) and `aria-keyshortcuts`,
 * so a screen reader announces the key the tooltip shows.
 */
export function keyProps(t: UseTranslationResult['t'], name: string, id: KeyCommandId): { title: string; 'aria-keyshortcuts': string } {
  return { title: t('wall.withKey', { name, keys: shortcutLabel(id) }), 'aria-keyshortcuts': ariaKeyShortcuts(id) };
}
