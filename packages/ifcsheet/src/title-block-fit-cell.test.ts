/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A value longer than its cell wraps, then shrinks, and only when that is not enough is cut with an ellipsis and
 * reported (F_01 review: a beneficiary or a report reference was lost silently). The values are the review's.
 */

import { describe, expect, it } from 'vitest';
import { modelReadiness, describeReadiness } from './readiness.js';
import { printTitleBlock, titleBlockMisfits } from './title-block-print.js';
import { romanianTitleBlock, TITLE_BLOCK_CAPTIONS_RO, type RoCaption } from './title-block-ro.js';
import { standardTitleBlock } from './title-block-standard.js';
import { fitCell, fitText, TEXT_FIT_MIN, type TemplateText } from './title-block-template.js';
import { textWidthEm } from './text-width.js';
import { TITLE_BLOCK_MM } from './sheet-frame.js';

const layout = romanianTitleBlock((k: RoCaption) => TITLE_BLOCK_CAPTIONS_RO[k]);
const texts = layout.items.filter((i): i is TemplateText => i.kind === 'text');
const valueOf = (param: string): TemplateText => {
  const t = texts.find((x) => x.text === `{${param}}`);
  if (!t) throw new Error(`no ${param}`);
  return t;
};

/** The review's long values (long.json), by layout parameter. */
const LONG: Record<string, string> = {
  Client: 'S.C. Societatea Comercială de Construcții și Investiții Imobiliare Reunite S.R.L.',
  Project: 'Construire locuință unifamilială P+1E cu garaj și împrejmuire, str. Principală nr. 12',
  Organisation: 'S.C. Birou de Arhitectură și Proiectare Integrată Dumitrescu & Asociații S.R.L.',
  Address: 'București, Sector 1, Strada Gheorghe Gheorghiu-Dej nr. 123, bl. 4, sc. A',
  ProjectManager: 'arh. Alexandru Constantinescu-Vasilescu',
  ProjectManagerTitle: 'arhitect cu drept de semnătură',
  DrawnBy: 'Ing. Maria-Magdalena Ionescu-Popescu',
  CheckedBy: 'Ing. Gheorghe Popescu-Tăriceanu',
  VerifierCapacity: 'verificator atestat Af, B2, C, D, Ie, Is',
  VerifierRequirement: 'A1, B2, C, D, E, F',
  ReportNumber: 'Referat de verificare nr. 123456/2026-10-20',
  ReportDate: '2026-10-20 / 2026-11-30',
};
/** The letters of a value, blanks left out: a line may end after a hyphen or a slash, where the blank is not part of the value. */
const letters = (s: string): string => s.replace(/\s+/g, '');

describe('fitCell on the Romanian layout', () => {
  for (const [param, value] of Object.entries(LONG)) {
    it(`prints ${param} in full, every line inside its cell, no smaller than ${TEXT_FIT_MIN} mm`, () => {
      const item = valueOf(param);
      const cell = fitCell(item, value);
      expect(cell.fits, `${param} fits`).toBe(true);
      expect(cell.size).toBeGreaterThanOrEqual(TEXT_FIT_MIN - 1e-9);
      expect(cell.lines.length).toBeLessThanOrEqual(2);
      for (const l of cell.lines) expect(textWidthEm(l.text, item.bold) * cell.size, l.text).toBeLessThanOrEqual(item.fit! + 1e-9);
      expect(letters(cell.lines.map((l) => l.text).join('')), 'nothing lost').toBe(letters(value));
      expect(cell.lines.some((l) => l.text.includes('…'))).toBe(false);
    });
  }

  it('wraps the 80-character beneficiary onto two lines rather than cutting it', () => {
    const cell = fitCell(valueOf('Client'), LONG.Client);
    expect(cell.lines).toHaveLength(2);
    // The old rule (shrink to the minimum, then cut) lost the end of it.
    expect(fitText(valueOf('Client'), LONG.Client).text).toContain('…');
  });

  it('keeps a value that fits as it was: one line at the cell\'s own height', () => {
    const item = valueOf('Client');
    expect(fitCell(item, 'S.C. Alfa S.R.L.')).toEqual({ size: item.size, lines: [{ text: 'S.C. Alfa S.R.L.', dy: 0 }], fits: true });
  });

  it('keeps a wrapped cell under its caption and above the cell\'s lower rule', () => {
    const rowH = TITLE_BLOCK_MM.h / 6;
    for (const [param, value] of Object.entries(LONG)) {
      const item = valueOf(param);
      const cell = fitCell(item, value);
      const first = item.y + cell.lines[0].dy;
      const last = item.y + cell.lines[cell.lines.length - 1].dy;
      expect(first - 0.72 * cell.size, `${param} clears the caption`).toBeGreaterThanOrEqual(item.top! - 1e-9);
      const cellBottom = (Math.floor(item.y / rowH) + 1) * rowH;
      expect(last, `${param} baseline above the cell's rule`).toBeLessThanOrEqual(cellBottom - 0.2 * cell.size);
    }
  });

  it('cuts with an ellipsis, at the smallest height, only what even two small lines cannot hold, and says so', () => {
    const item = valueOf('Client');
    const absurd = Array.from({ length: 12 }, () => LONG.Client).join(' ');
    const cell = fitCell(item, absurd);
    expect(cell.fits).toBe(false);
    expect(cell.size).toBe(TEXT_FIT_MIN);
    expect(cell.lines[cell.lines.length - 1].text.endsWith('…')).toBe(true);
    for (const l of cell.lines) expect(textWidthEm(l.text) * cell.size).toBeLessThanOrEqual(item.fit! + 1e-9);
    // A single word wider than the cell is cut too.
    expect(fitCell(item, 'X'.repeat(200)).fits).toBe(false);
  });

  it('leaves an item without lines to the old rule, so the standard layout prints as before', () => {
    for (const item of standardTitleBlock().items.filter((i): i is TemplateText => i.kind === 'text')) {
      for (const shown of ['', 'Villa', LONG.Project, 'W'.repeat(120)]) {
        const old = fitText(item, shown);
        expect(fitCell(item, shown)).toEqual({ size: old.size, lines: [{ text: old.text, dy: 0 }], fits: old.text === shown });
      }
    }
  });
});

describe('the printed title block', () => {
  const lookup = (n: string): string | undefined => LONG[n] ?? (n === 'Scale' ? '1:100' : n === 'SheetNumber' ? 'A-101' : '');
  const box = { x: 0, y: 0, w: TITLE_BLOCK_MM.w, h: TITLE_BLOCK_MM.h };

  it('prints every word of every long value, stays inside the block, and puts a wrapped value\'s lines in reading order', () => {
    const { texts: out } = printTitleBlock(layout, lookup, box, false);
    const all = out.map((t) => t.text).join(' ');
    for (const [param, value] of Object.entries(LONG)) expect(letters(all), param).toContain(letters(value));
    for (const t of out) {
      expect(t.at.x).toBeGreaterThanOrEqual(0);
      expect(t.at.x + textWidthEm(t.text) * t.size).toBeLessThanOrEqual(TITLE_BLOCK_MM.w);
      expect(t.at.y).toBeLessThanOrEqual(TITLE_BLOCK_MM.h);
    }
    const client = out.filter((t) => LONG.Client.includes(t.text) && t.text.length > 3);
    expect(client.length).toBeGreaterThanOrEqual(2);
    expect(client[1].at.y).toBeGreaterThan(client[0].at.y);
  });
});

describe('the finding for a value that does not fit', () => {
  const sheets = (client: string) => [{ sheet: 'A-101 Plan parter', lookup: (n: string) => (n === 'Client' ? client : '') }];

  it('names the cell and the sheet for a value even two small lines cannot hold, and for nothing else', () => {
    expect(titleBlockMisfits(layout, sheets(LONG.Client))).toEqual([]);
    const misfits = titleBlockMisfits(layout, sheets(Array.from({ length: 12 }, () => LONG.Client).join(' ')));
    expect(misfits).toEqual([{ sheet: 'A-101 Plan parter', field: 'Beneficiar' }]);
    expect(titleBlockMisfits(standardTitleBlock(), sheets('x '.repeat(300)))).toEqual([]);
  });

  it('is a readiness finding, said even when the model is empty', () => {
    const found = modelReadiness({ storeys: 0, spaces: 0, elements: 0, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 }, [], undefined, [{ sheet: 'A-101 Plan parter', field: 'Beneficiar' }]);
    expect(found.map((f) => f.kind)).toEqual(['titleBlockFit']);
    expect(describeReadiness(found[0]).missing).toBe('Title block: Beneficiar does not fit its cell on A-101 Plan parter; shorten it or use an abbreviation.');
  });
});
