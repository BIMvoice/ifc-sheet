/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #479: the word a continued schedule page adds to its title is set twice, by the app's catalogue (`schedule.continued`) and by the
 * engine (`SCHEDULE_CONTINUED`, which `ifcsheet build --project` and the MCP export print). The sheet the app shows and the PDF the
 * headless engine writes must say the same word in each language.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE_CONTINUED } from '@bimvoice/ifcsheet/headless';
import { wallArrangeEn } from '@/i18n/catalogues/wall-arrange.en.js';
import { wallArrangeRo } from '@/i18n/catalogues/wall-arrange.ro.js';

describe('the "continued" word of a schedule page', () => {
  it('is the same in the engine as in the app, in English and in Romanian', () => {
    assert.equal(SCHEDULE_CONTINUED.en, wallArrangeEn['schedule.continued']);
    assert.equal(SCHEDULE_CONTINUED.ro, wallArrangeRo['schedule.continued']);
  });

  it('has a word for exactly the languages the app has', () => {
    assert.deepEqual(Object.keys(SCHEDULE_CONTINUED).sort(), ['en', 'ro']);
  });
});
