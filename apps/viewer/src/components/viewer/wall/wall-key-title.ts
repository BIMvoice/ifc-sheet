/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { UseTranslationResult } from '@/i18n';
import type { WallKeyId } from '@/lib/commands/wall-key-commands';
import { shortcutLabel } from '@/lib/commands/shortcut-label';

/** A control's tooltip: its name and the keymap's key for it, written for the platform. */
export function keyTitle(t: UseTranslationResult['t'], name: string, id: WallKeyId): string {
  return t('wall.withKey', { name, keys: shortcutLabel(id) });
}
