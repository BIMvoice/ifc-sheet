/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #674: "m2" and "m3" right after a number become "m²" and "m³" as they are typed; anything that is not a unit stays. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeDxfCp1252 } from '@ifc-lite/drawing-2d';
import { escapeDxfText } from '@/components/viewer/sheets/dxf-r2000';
import { unitAt } from './unit-superscript';

/** What typing `text` (caret at its end) leaves. */
const typed = (text: string): string => {
  const hit = unitAt(text, text.length);
  return hit ? text.slice(0, hit.at) + hit.char + text.slice(hit.at + 1) : text;
};

describe('typing a unit after a number (#674)', () => {
  it('converts m2 and m3 after a number, with or without a space and with either decimal sign', () => {
    assert.equal(typed('25.2 m2'), '25.2 m²');
    assert.equal(typed('25,2m2'), '25,2m²');
    assert.equal(typed('12 m3'), '12 m³');
    assert.equal(typed('Kitchen 25.21 m2'), 'Kitchen 25.21 m²');
    assert.equal(typed('7m3'), '7m³');
  });

  it('leaves what is not a unit as it is', () => {
    for (const same of ['M2', 'm2', 'Sheet M2', 'Room m2', 'cm2', '25 cm2', 'a5m2', 'A5 m2', '25 M2', '25 m4', '25 m', '5 mm2']) assert.equal(typed(same), same);
  });

  it('waits when the unit is followed by a letter or a digit (m25, m2x), and converts before a space', () => {
    assert.equal(unitAt('25 m2x', 5), null);
    assert.equal(unitAt('25 m25', 5), null);
    assert.deepEqual(unitAt('25 m2 free', 5), { at: 4, char: '²' });
  });
});

describe('the superscripts in a PDF (#674)', () => {
  it('have a glyph in the embedded Inter', async () => {
    const { jsPDF } = await import('jspdf');
    const { embedFonts, missingGlyphs } = await import('@/issue/pdf-fonts');
    const doc = new jsPDF();
    const load = (url: string) => Promise.resolve(new Uint8Array(readFileSync(new URL(`../../public/fonts/${url.split('/').pop()}`, import.meta.url))));
    assert.equal(await embedFonts(doc, load), true);
    assert.deepEqual(missingGlyphs(doc, 'Kitchen 25.21 m² 12 m³'), []);
  });
});

describe('the superscripts in a DXF (#674)', () => {
  it('are windows-1252 bytes (0xB2, 0xB3), not a `?` and not an escape', () => {
    const text = 'Kitchen 25.21 m² 12 m³';
    assert.equal(escapeDxfText(text), text);
    const encoded = encodeDxfCp1252(text);
    assert.equal(encoded.hadUnmappable, false);
    assert.deepEqual([...encoded.bytes].filter((b) => b === 0xb2 || b === 0xb3), [0xb2, 0xb3]);
  });
});
