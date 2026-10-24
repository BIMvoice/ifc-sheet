/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #269: the figures on the urban indicators sheet follow the language the
 * sheet is printed in ("120,00" in Romanian, "120.00" in English), through
 * the one formatter the site balance uses, and nothing but the text changes:
 * every position on the sheet is the same number in both.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import type { UrbanIndicators } from './indicators';
import { layoutUrban, signedLevel, type UrbanLabels } from './urban-layout';

const RESULT: UrbanIndicators = {
  storeys: [
    { name: 'Dachgeschoss', elevation: 2.7, height: null, builtArea: 118.5, usefulArea: 96, belowGround: false, ground: false, inCut: true, inCutByDefault: true, unmeasured: 0 },
    { name: 'Erdgeschoss', elevation: 0, height: 2.7, builtArea: 120, usefulArea: 99.25, belowGround: false, ground: true, inCut: true, inCutByDefault: true, unmeasured: 0 },
    { name: 'Keller', elevation: -2.4, height: 2.4, builtArea: 1234.5, usefulArea: null, belowGround: true, ground: false, inCut: false, inCutByDefault: false, unmeasured: 0 },
  ],
  ac: 120, ad: 240, adCut: 238.5, acAtLeast: false, adAtLeast: false, adCutAtLeast: false,
  au: 195.25, auByCategory: [{ category: 'Flur', area: 12.5 }],
  siteArea: 600, pot: 20, cut: 0.4, terrainLevel: -1.5, zero: { elevation: 0, source: 'model' },
};

const labels = (locale: string): UrbanLabels => ({
  locale, title: 'T', level: 'Level', elevation: 'Elevation', built: 'Built', useful: 'Useful', inCut: 'In CUT', yes: 'yes', no: 'no',
  belowGround: (n) => n, ground: (n) => n, category: 'Category', area: 'Area',
  ac: 'Ac', ad: 'Ad', adCut: 'Ad for CUT', au: 'Au', site: 'Site', pot: 'POT', cut: 'CUT', rules: () => [], note: '',
  atLeast: (v) => `>= ${v}`, unmeasured: (count, level) => `${count} unmeasured on ${level}`,
});
const print = (locale: string) => layoutUrban(RESULT, labels(locale));
const texts = (locale: string) => print(locale).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
const after = (all: string[], label: string) => all[all.indexOf(label) + 1];

describe('the urban indicators sheet follows the language (#269)', () => {
  it('prints 120,00 in Română and 120.00 in English', () => {
    assert.equal(after(texts('ro'), 'Ac'), '120,00');
    assert.equal(after(texts('en'), 'Ac'), '120.00');
  });

  it('writes every figure of the sheet in the language: areas, levels, POT and CUT', () => {
    const ro = texts('ro');
    assert.equal(after(ro, 'Ad'), '240,00');
    assert.equal(after(ro, 'Ad for CUT'), '238,50');
    assert.equal(after(ro, 'Au'), '195,25');
    assert.equal(after(ro, 'Site'), '600,00');
    assert.equal(after(ro, 'POT'), '20,00 %');
    assert.equal(after(ro, 'CUT'), '0,40');
    assert.equal(after(ro, 'Flur'), '12,50');
    // The storey table: elevation, built, useful.
    for (const figure of ['+2,70', '±0,00', '-2,40', '118,50', '96,00', '99,25', '1.234,50']) assert.ok(ro.includes(figure), `${figure} in ${ro.join(' | ')}`);
    // No figure left with a decimal point: nothing on the sheet is a number written the English way.
    assert.deepEqual(ro.filter((t) => /\d\.\d{2}\b/.test(t) && !/\d\.\d{3}/.test(t)), []);
    const en = texts('en');
    for (const figure of ['+2.70', '±0.00', '-2.40', '118.50', '1,234.50']) assert.ok(en.includes(figure), `${figure} in ${en.join(' | ')}`);
  });

  it('a lower bound keeps its marker and the language\'s figure', () => {
    const low = layoutUrban({ ...RESULT, acAtLeast: true }, labels('ro')).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    assert.equal(after(low, 'Ac'), '>= 120,00');
  });

  it('the same value prints the same text as the site balance: both are sheetNumber', () => {
    // SiteBalance.tsx reads the figure through `sheetNumber(locale, v)`; the sheet must produce exactly that text.
    for (const locale of ['ro', 'en']) {
      assert.equal(after(texts(locale), 'Ac'), sheetNumber(locale, RESULT.ac!));
      assert.equal(after(texts(locale), 'Au'), sheetNumber(locale, RESULT.au!));
      assert.equal(after(texts(locale), 'CUT'), sheetNumber(locale, RESULT.cut!));
      assert.equal(signedLevel(locale, 2.7).slice(1), sheetNumber(locale, 2.7, 2, { group: false }));
    }
  });

  it('changes no position: the sheet\'s geometry is the same number in every language', () => {
    const geometry = (locale: string) => print(locale).prims.map((p) => (p.kind === 'text' ? { ...p, text: '' } : p));
    assert.deepEqual(geometry('ro'), geometry('en'));
    assert.equal(print('ro').width, print('en').width);
    assert.equal(print('ro').height, print('en').height);
    // Positions stay numbers, not text with a comma.
    for (const p of print('ro').prims) {
      if (p.kind === 'text') assert.equal(typeof p.x, 'number');
    }
  });
});
