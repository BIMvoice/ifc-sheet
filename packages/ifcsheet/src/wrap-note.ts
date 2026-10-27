/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** About the characters a 2 mm note line holds across the table. */
const NOTE_CHARS = 120;

/** A note broken at spaces into lines of about `chars` characters (2 mm text). */
export function wrapNote(note: string, chars = NOTE_CHARS): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of note.split(' ')) {
    if (line && line.length + 1 + word.length > chars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
