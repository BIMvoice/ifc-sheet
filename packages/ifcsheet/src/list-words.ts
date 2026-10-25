/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words a schedule built from the Lists engine says that the Lists engine does not (#78): the Count heading, the Total row and the two
 * words a yes/no cell is written with. English and Romanian, the one copy: the app's catalogues (`list-schedule.en.ts`, `list-schedule.ro.ts`)
 * spread these and the command line and the MCP tools print them. Imports nothing, so a catalogue loads it without the parser.
 */

export const LIST_WORDS_EN = {
  'listSched.count': 'Count',
  'listSched.total': 'Total',
  'listSched.yes': 'Yes',
  'listSched.no': 'No',
} as const;

export const LIST_WORDS_RO: Record<keyof typeof LIST_WORDS_EN, string> = {
  'listSched.count': 'Număr',
  'listSched.total': 'Total',
  'listSched.yes': 'Da',
  'listSched.no': 'Nu',
};

/** The words in the shape the table builders take. Any language but Romanian is English, like the other command-line tables. */
export function listWordsFor(locale: string): { count: string; total: string; yes: string; no: string } {
  const w = /^ro\b/i.test(locale) ? LIST_WORDS_RO : LIST_WORDS_EN;
  return { count: w['listSched.count'], total: w['listSched.total'], yes: w['listSched.yes'], no: w['listSched.no'] };
}
