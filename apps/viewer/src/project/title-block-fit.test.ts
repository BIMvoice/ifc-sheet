/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { fitText, standardTitleBlock, TEXT_FIT_MIN, type TemplateText } from './title-block-template';
import { TITLE_BLOCK_MM } from './sheet-frame';
import { textWidthEm } from './text-width';

/**
 * The project name stays inside its cell (audit #220): the standard layout's
 * Project value sits 2 mm in from the cell's left edge, and the Address cell
 * starts at half the block's left part.
 */

const items = standardTitleBlock((k) => k, DEFAULT_GRAPHIC_STANDARD).items;
const projectValue = items.find((i): i is TemplateText => i.kind === 'text' && i.text === '{Project}')!;
const cellRight = (TITLE_BLOCK_MM.w - 50) / 2;
/** Millimetres between the printed text and the divider: the value's own left inset, again on the right. */
const MARGIN_MM = 1.5;

const printedWidth = (shown: string): number => {
  const { size, text } = fitText(projectValue, shown);
  return textWidthEm(text) * size;
};

describe('the title block project name (#220)', () => {
  it('reads the cell it sits in: left of the divider to the Address cell', () => {
    assert.ok(projectValue.fit && projectValue.x + projectValue.fit < cellRight, 'the fit width ends inside the cell');
  });

  it('keeps "10 Appartementen Schependomlaan" inside its cell with a visible margin', () => {
    const name = '10 Appartementen Schependomlaan';
    const { size, text } = fitText(projectValue, name);
    assert.equal(text, name, 'shrunk, not cut');
    assert.ok(size < projectValue.size, 'the old estimate left it at full size, where it reached the divider');
    assert.ok(projectValue.x + printedWidth(name) <= cellRight - MARGIN_MM, `ends at ${projectValue.x + printedWidth(name)} of ${cellRight}`);
  });

  it('keeps a long Romanian name with diacritics inside its cell, shrunk to the type scale\'s smallest and then cut with an ellipsis', () => {
    const name = 'Ansamblu rezidențial „Șoseaua Ștefan cel Mare și Sfânt”, corpul C1, etapa întâi, Târgu Mureș';
    const { size, text } = fitText(projectValue, name);
    assert.equal(size, TEXT_FIT_MIN);
    assert.ok(text.endsWith('…') && text.length < name.length);
    assert.ok(name.startsWith(text.slice(0, -1)), 'a prefix of the name');
    assert.ok(projectValue.x + printedWidth(name) <= cellRight - MARGIN_MM);
  });

  it('measures a letter with a diacritic as its base letter, and bold wider than regular', () => {
    assert.equal(textWidthEm('șțăâî'), textWidthEm('staai'));
    assert.equal(textWidthEm('Ș'), textWidthEm('S'));
    assert.ok(textWidthEm('Floor plans', true) > textWidthEm('Floor plans'));
  });

  it('leaves a short name at full size and unchanged', () => {
    assert.deepEqual(fitText(projectValue, 'Villa'), { size: projectValue.size, text: 'Villa' });
  });

  it('fits whatever length: never wider than the cell, for names of 1 to 200 characters', () => {
    for (let n = 1; n <= 200; n += 7) {
      const name = 'Șoseaua Mihai Eminescu '.repeat(10).slice(0, n);
      assert.ok(projectValue.x + printedWidth(name) <= cellRight - MARGIN_MM, `${n} characters`);
    }
  });
});
