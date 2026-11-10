/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { encodeDxfCp1252 } from './encoding.js';

/**
 * A TEXT value for a windows-1252 file: a character windows-1252 has no byte for (ă, ș, ț) becomes the `\U+XXXX` escape (one per UTF-16
 * unit, uppercase hex) that AutoCAD and the readers that follow it decode, where a plain encode would write `?`; a literal `\U+` in the
 * value is escaped first so it is not read back as one.
 */
export function escapeDxfText(value: string): string {
  return value.replace(/\\U\+/gi, '\\U+005CU+').replace(/[^\x20-\x7e\u00a0-\u00ff]/gu, (ch) => {
    if (!encodeDxfCp1252(ch).hadUnmappable) return ch;
    return Array.from({ length: ch.length }, (_, i) => `\\U+${ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`).join('');
  });
}
