/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { StepTextScan } from './step-lexing.js';

/**
 * Return the source between a record's opening parenthesis and its matching
 * close. The entity reference handed to the extractor can include trailing
 * STEP trivia before `;`; a greedy regex therefore mistakes a `)` inside that
 * trivia for the record close. Strings and comments carry no structure, just
 * as they do in the tokenizer's byte-level record-boundary scanner.
 */
export function entityParameters(record: string, openEnd: number): string | undefined {
  let depth = 1;
  const lexical = new StepTextScan(record);
  for (let index = openEnd; index < record.length;) {
    const skipped = lexical.skipLexicalAt(index);
    if (skipped > index) {
      index = skipped;
      continue;
    }
    const char = record[index];
    if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return record.slice(openEnd, index);
    index++;
  }
  return undefined;
}
