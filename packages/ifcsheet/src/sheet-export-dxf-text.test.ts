/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #619: `ifcsheet build --dxf` wrote a DXF with linework only. The sheet's text (its title block, view titles, notes) is TEXT in the
 * file, and the Romanian letters windows-1252 has no byte for (ă, ș, ț) are `\U+XXXX` escapes rather than `?`. The app's writer is held
 * to the same text by `apps/viewer/src/components/viewer/sheets/sheet-dxf-parity.test.tsx`.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { exportDxf } from './export.js';
import { sheetGraphic } from './sheet-graphic.js';

/** The review's title: ă, ș, ț (escaped) beside Î and â (windows-1252 bytes). */
export const TITLE = 'Planșeu țiglă ă Î â';

const sheet: ProjectSheet = { id: 's1', number: 'A-101', name: TITLE, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [] };
const doc: ProjectDocument = { name: 'Casă', models: [], sheets: [sheet], views: [], titleBlock: { project: TITLE, date: '2026-10-21' } };

/** The (layer, value) of every TEXT entity of a DXF, read from its group codes. */
export function textsOf(dxf: string): { layer: string; value: string }[] {
  const lines = dxf.split(/\r?\n/);
  const out: { layer: string; value: string }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '0' || lines[i + 1].trim() !== 'TEXT') continue;
    let layer = '';
    let value = '';
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2) {
      if (lines[j].trim() === '8') layer = lines[j + 1];
      if (lines[j].trim() === '1') value = lines[j + 1];
    }
    out.push({ layer, value });
  }
  return out;
}

describe('the CLI sheet DXF carries the sheet text', () => {
  const graphic = sheetGraphic(sheet, doc, new Map());
  const dxf = exportDxf(graphic);
  const texts = textsOf(dxf);

  it('has a TEXT for every non-blank text of the sheet, on one layer', () => {
    const wanted = graphic.texts.map((t) => t.text).filter((t) => t.trim());
    expect(wanted.length).toBeGreaterThan(3);
    expect(texts.map((t) => t.value).sort()).toEqual(wanted.map((t) => t.replace(/[ășț]/g, (c) => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)).sort());
    expect(new Set(texts.map((t) => t.layer))).toEqual(new Set(['SHEET-TEXT']));
  });

  it('keeps the title block\'s "Planșeu țiglă ă Î â": ă, ș, ț as escapes, Î and â as themselves', () => {
    expect(graphic.texts.map((t) => t.text)).toContain(TITLE);
    expect(texts.map((t) => t.value)).toContain('Plan\\U+0219eu \\U+021Bigl\\U+0103 \\U+0103 Î â');
    expect(dxf).not.toMatch(/\?eu/);
  });

  it('writes a literal backslash-U+ as text, not as an escape', () => {
    const odd = exportDxf({ ...graphic, texts: [{ at: { x: 10, y: 10 }, text: 'a\\U+0041b', size: 3 }] });
    expect(textsOf(odd).map((t) => t.value)).toEqual(['a\\U+005CU+0041b']);
  });
});
