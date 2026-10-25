/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `en.ts` and `locales/ro.ts` spread their catalogues in alphabetical order of file, so two PRs adding a
 * catalogue do not touch the same line (#144). That is only safe while no key is in two catalogues of a
 * language: a later spread would win, and the order would decide the text.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { en } from './en';
import ro from './locales/ro';

const dir = new URL('./catalogues/', import.meta.url);

async function keysByFile(language: 'en' | 'ro'): Promise<Map<string, string[]>> {
  const owners = new Map<string, string[]>();
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(`.${language}.ts`) || file.includes('.test.')) continue;
    const mod = (await import(new URL(file, dir).href)) as Record<string, unknown>;
    for (const catalogue of Object.values(mod)) {
      if (typeof catalogue !== 'object' || catalogue === null) continue;
      for (const key of Object.keys(catalogue)) owners.set(key, [...(owners.get(key) ?? []), file]);
    }
  }
  return owners;
}

describe('the feature catalogues', () => {
  for (const [language, merged] of [['en', en], ['ro', ro]] as const) {
    it(`${language}: no key is defined in two catalogues, so the order they are spread in decides nothing`, async () => {
      const owners = await keysByFile(language);
      assert.deepEqual([...owners].filter(([, files]) => new Set(files).size > 1).map(([key, files]) => `${key}: ${files.join(', ')}`), []);
      // And none is lost: every key of a catalogue file is in the merged catalogue (a file imported but not spread, or the reverse).
      assert.deepEqual([...owners.keys()].filter((key) => !(key in merged)), []);
      assert.deepEqual(Object.keys(merged).filter((key) => !owners.has(key)), []);
    });
  }
});
