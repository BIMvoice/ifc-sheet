/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #479: the words the room schedule, its area summary and the drawing register print with are the engine's (`SHEET_WORDS_EN`, `SHEET_WORDS_RO`)
 * and the app's catalogues keep a copy under the same keys, so `ifcsheet build` and the app's sheet cannot word a table differently. The
 * room schedule's column headings are `roomScheduleWords`, the engine's too.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roomScheduleWords, SHEET_WORDS_EN, SHEET_WORDS_RO, type SheetWordKey } from '@bimvoice/ifcsheet';
import { en, type TranslationKey } from '@/i18n/en';
import ro from '@/i18n/locales/ro';

const keys = Object.keys(SHEET_WORDS_EN) as SheetWordKey[];
const catalogues = { en: en as Record<string, unknown>, ro: ro as Record<string, unknown> };
const text = (catalogue: Record<string, unknown>, key: string): unknown => catalogue[key];

describe('the words of the sheets the engine prints are the catalogues\' (#479)', () => {
  for (const [language, words] of [['en', SHEET_WORDS_EN], ['ro', SHEET_WORDS_RO]] as const) {
    it(`${language}: every key of the engine's table reads the same in the app's catalogue`, () => {
      for (const key of keys) assert.equal(text(catalogues[language], key), words[key], key);
    });
    it(`${language}: the room schedule's column headings are the catalogue's`, () => {
      const w = roomScheduleWords(language);
      const c = catalogues[language];
      const pairs: [string, string][] = [['roomSched.number', w.number], ['roomSched.room', w.room], ['roomSched.area', w.area], ['roomSum.perimeter', w.perimeter], ['roomSched.total', w.total], ['roomSched.noLevel', w.noLevel]];
      for (const [key, want] of pairs) assert.equal(text(c, key), want, key);
      assert.equal(text(c, 'roomSched.levelTotal'), 'Total {level}');
      assert.equal(w.levelTotal('X'), 'Total X');
    });
  }
  it('the keys are keys of the catalogue', () => {
    const typed: TranslationKey[] = keys;
    assert.equal(typed.length, keys.length);
  });
});
