/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which sheet text the issued PDF moves to the embedded Inter (review of #110): the sans-serif text, and serif or
 * monospace text only when it has a letter the standard PDF fonts (WinAnsi) cannot show. A text style set to serif
 * or monospace otherwise keeps its family, which svg2pdf draws in Times or Courier.
 */
import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fontFamilyOf } from '@/drafting/text-width';
import { useEmbeddedFont } from './pdf-fonts.js';

const SANS = fontFamilyOf('sans');
const SERIF = fontFamilyOf('serif');
const MONO = fontFamilyOf('mono');

function sheet(): Element {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg">
    <text id="sans" font-family="${SANS}">Plan</text>
    <text id="serif" font-family="${SERIF}">Façade “Nord”</text>
    <text id="mono" style="font-family: ${MONO}">W-01 – 0.90</text>
    <g id="serif-ro" font-family="${SERIF}"><text>Secțiune</text></g>
    <text id="inherits">Title</text>
  </svg>`;
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement as unknown as Element;
}

const family = (root: Element, id: string) => {
  const el = root.querySelector(`#${id}`)!;
  return el.getAttribute('font-family') || (el as SVGElement).style.fontFamily;
};

describe('the sheet text the issued PDF sets in Inter', () => {
  it('moves sans-serif text and the inherited default, and keeps serif and monospace text the standard fonts can show', () => {
    const root = sheet();
    useEmbeddedFont(root);
    assert.equal(root.getAttribute('font-family'), 'Inter');
    assert.equal(family(root, 'sans'), 'Inter');
    assert.equal(family(root, 'serif'), SERIF);
    assert.equal(family(root, 'mono'), MONO);
  });

  it('moves serif text with a letter WinAnsi lacks (ț), and says so', () => {
    const root = sheet();
    assert.equal(useEmbeddedFont(root), true);
    assert.equal(family(root, 'serif-ro'), 'Inter');
  });

  it('says nothing when no serif or monospace text had to move', () => {
    const root = sheet();
    root.querySelector('#serif-ro')!.remove();
    assert.equal(useEmbeddedFont(root), false);
  });

  it('leaves every family alone when Inter is not embedded', () => {
    const root = sheet();
    assert.equal(useEmbeddedFont(root, false), false);
    assert.equal(root.getAttribute('font-family'), null);
    assert.equal(family(root, 'sans'), SANS);
    assert.equal(family(root, 'serif-ro'), SERIF);
  });
});
