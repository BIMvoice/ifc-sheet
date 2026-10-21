/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The reviewer's name: remembered in the browser's local settings so it is
 * asked for once. Storage can be absent or refuse (private windows, blocked
 * site data), and then the name simply is not remembered.
 */

const KEY = 'ifcsheet.reviewer';

export function rememberedAuthor(): string {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? '';
  } catch (err) {
    console.warn('[ifcsheet] could not read the reviewer name', err);
    return '';
  }
}

export function rememberAuthor(name: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, name);
  } catch (err) {
    console.warn('[ifcsheet] could not remember the reviewer name', err);
  }
}
