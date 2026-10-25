/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fitText, frameRect, paperMm, printTitleBlock, resolveParamText, textWidthEm, titleBlockRect, type TemplateItem, type TemplateText, type PaperSize } from '@bimvoice/ifcsheet';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { titleBlockRoEn } from '@/i18n/catalogues/title-block-ro.en';
import { titleBlockRoRo } from '@/i18n/catalogues/title-block-ro.ro';
import { TITLE_BLOCK_MM } from './sheet-frame';
import { RO_COLUMNS, RO_STAMP_TOP, romanianTitleBlock } from './title-block-ro';
import { BUILTIN_PARAMS, SOFT_BUILTINS } from './title-block-params';

/**
 * The Romanian title block (#54): every field sits inside its own cell with a
 * margin, however long the value; the block lies inside the frame at A4 to
 * A0, both ways round and in both positions; the two stamp boxes are empty
 * and big enough to stamp and sign in; captions exist in both languages.
 */

const ro = (k: string): string => (titleBlockRoRo as Record<string, string>)[k] ?? k;
const en = (k: string): string => (titleBlockRoEn as Record<string, string>)[k] ?? k;
const layout = romanianTitleBlock(ro as never, DEFAULT_GRAPHIC_STANDARD);
const texts = layout.items.filter((i): i is TemplateText => i.kind === 'text');
const lines = layout.items.flatMap((i) => (i.kind === 'line' ? [i] : []));
const KNOWN = new Set<string>([...BUILTIN_PARAMS, ...SOFT_BUILTINS]);
const LONG = 'Ansamblu rezidențial „Șoseaua Ștefan cel Mare și Sfânt”, corpul C1, etapa întâi, Târgu Mureș';

/** The nearest rule to the right of a text's start, on its row: the cell's right edge. */
function cellRight(t: TemplateText): number {
  const verticals = lines.filter((l) => l.x1 === l.x2 && l.x1 > t.x && Math.min(l.y1, l.y2) < t.y && Math.max(l.y1, l.y2) >= t.y).map((l) => l.x1);
  return Math.min(TITLE_BLOCK_MM.w, ...verticals);
}
/** The rules above and below a text, in the text's column: its cell's top and bottom. */
function cellRows(t: TemplateText): { top: number; bottom: number } {
  const horizontals = lines.filter((l) => l.y1 === l.y2 && Math.min(l.x1, l.x2) <= t.x && Math.max(l.x1, l.x2) > t.x).map((l) => l.y1);
  return { top: Math.max(0, ...horizontals.filter((y) => y < t.y)), bottom: Math.min(TITLE_BLOCK_MM.h, ...horizontals.filter((y) => y >= t.y)) };
}

describe('the Romanian title block layout', () => {
  it('prints every field the practice asks for, each from a name the program fills', () => {
    const used = texts.flatMap((t) => [...t.text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    for (const name of ['ProjectPhase', 'ProjectNumber', 'ProjectManager', 'DesignedBy', 'DrawnBy', 'CheckedBy', 'Organisation', 'Project', 'Address', 'Client', 'SheetNumber', 'SheetName', 'Scale', 'Date', 'Revision']) assert.ok(used.includes(name), name);
    for (const name of used) assert.ok(KNOWN.has(name), `${name} is a built-in`);
  });

  it('keeps every value inside its cell with a margin, even a very long one, and below the cell\'s top rule', () => {
    for (const t of texts.filter((x) => x.text.startsWith('{'))) {
      const right = cellRight(t);
      const { size, text } = fitText(t, LONG);
      const printedRight = t.x + textWidthEm(text, t.bold) * size;
      assert.ok(printedRight <= right - 1, `${t.text} ends at ${printedRight.toFixed(1)} of ${right}`);
      const { top, bottom } = cellRows(t);
      assert.ok(t.y <= bottom - 0.4, `${t.text} baseline ${t.y} above the rule at ${bottom}`);
      assert.ok(t.y - t.size * 0.72 >= top + 0.4, `${t.text} cap height clears the rule at ${top}`);
    }
  });

  it('keeps every caption inside its cell in Romanian and in English', () => {
    for (const say of [ro, en]) {
      const l = romanianTitleBlock(say as never, DEFAULT_GRAPHIC_STANDARD);
      for (const t of l.items.filter((i): i is TemplateText => i.kind === 'text' && !i.text.startsWith('{'))) {
        const { size, text } = fitText(t, t.text);
        assert.ok(t.x + textWidthEm(text) * size <= cellRight(t) - 1, `"${t.text}" fits`);
      }
    }
  });

  it('lies inside the title block\'s box, which lies inside the frame, at A4 to A0, both ways round, in both positions', () => {
    const lookup = (n: string): string => (n === 'Scale' ? '1:50, 1:100' : LONG);
    for (const size of ['A4', 'A3', 'A2', 'A1', 'A0'] as PaperSize[]) {
      for (const orientation of ['landscape', 'portrait'] as const) {
        for (const titleBlock of ['bottom-right', 'right'] as const) {
          const m = paperMm(size);
          const paper = orientation === 'landscape' ? { w: Math.max(m.w, m.h), h: Math.min(m.w, m.h) } : { w: Math.min(m.w, m.h), h: Math.max(m.w, m.h) };
          const frame = { margins: { top: 10, right: 10, bottom: 10, left: 10 }, titleBlock };
          const box = titleBlockRect(paper, frame);
          const f = frameRect(paper, frame);
          const out = printTitleBlock(layout, lookup, box, titleBlock === 'right');
          const where = `${size} ${orientation} ${titleBlock}`;
          const inBox = (p: { x: number; y: number }, pad = 1e-9): boolean => p.x >= box.x - pad && p.x <= box.x + box.w + pad && p.y >= box.y - pad && p.y <= box.y + box.h + pad;
          assert.ok(box.x >= f.x - 1e-9 && box.y >= f.y - 1e-9 && box.x + box.w <= f.x + f.w + 1e-9 && box.y + box.h <= f.y + f.h + 1e-9, `${where}: box in frame`);
          assert.ok(out.frame.flat().every((p) => inBox(p)), `${where}: shapes in the box`);
          assert.ok(out.texts.every((t) => inBox(t.at)), `${where}: texts start in the box`);
          assert.equal(out.texts.length, texts.length, `${where}: every text prints`);
        }
      }
    }
  });

  it('leaves two empty stamp boxes, each at least 30 x 25 mm, captioned for the designer and the verifier', () => {
    const inStamps = texts.filter((t) => t.x >= RO_COLUMNS.c && t.y > RO_STAMP_TOP);
    assert.deepEqual(inStamps.map((t) => t.text), ['Ștampilă proiectant', 'Ștampilă verificator']);
    const mid = (RO_COLUMNS.c + RO_COLUMNS.end) / 2;
    assert.ok(mid - RO_COLUMNS.c >= 30 && RO_COLUMNS.end - mid >= 30 && TITLE_BLOCK_MM.h - RO_STAMP_TOP >= 25);
    // Nothing else is drawn below the stamp captions inside the boxes: only the frame and the divider.
    const items: TemplateItem[] = layout.items.filter((i) => i.kind === 'text' && i.x >= RO_COLUMNS.c && i.y > RO_STAMP_TOP + 3.2);
    assert.deepEqual(items, []);
  });

  it('says the practice\'s words in Romanian and has English for each caption', () => {
    assert.deepEqual(
      ['tbro.generalDesigner', 'tbro.projectManager', 'tbro.designer', 'tbro.phase', 'tbro.projectNumber'].map(ro),
      ['Proiectant general', 'Șef proiect', 'Proiectat', 'Faza', 'Proiect nr.'],
    );
    for (const k of Object.keys(titleBlockRoEn)) assert.ok(k in titleBlockRoRo, `${k} has Romanian`);
    assert.equal(resolveParamText('{ProjectPhase}', () => 'DTAC'), 'DTAC');
  });
});
