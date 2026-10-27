/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_PARAMS, STANDARD_CAPTIONS_EN, TITLE_BLOCK_CAPTIONS_RO, type RoCaption, TITLE_BLOCK_FIELDS, fitCell, fitText, frameRect, paperMm, printTitleBlock, resolveParamText, textWidthEm, titleBlockRect, type TemplateText, type PaperSize } from '@bimvoice/ifcsheet';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import { titleBlockRoEn } from '@/i18n/catalogues/title-block-ro.en';
import { titleBlockRoRo } from '@/i18n/catalogues/title-block-ro.ro';
import { TITLE_BLOCK_MM } from './sheet-frame';
import { RO_ROWS, romanianTitleBlock } from './title-block-ro';
import { BUILTIN_PARAMS, SOFT_BUILTINS } from './title-block-params';

/**
 * The Romanian title block (#54): every field sits inside its own cell with a
 * margin, however long the value; the block lies inside the frame at A4 to
 * A0, both ways round and in both positions; the signature boxes are empty;
 * every datum of the model F_01 (Ordinul 975/2026, Anexa 4) has its caption and its value; captions exist in both languages.
 */

const ro = (k: string): string => TITLE_BLOCK_CAPTIONS_RO[k as RoCaption];
const en = (k: string): string => (titleBlockRoEn as Record<string, string>)[k] ?? STANDARD_CAPTIONS_EN[k as keyof typeof STANDARD_CAPTIONS_EN] ?? k;
const layout = romanianTitleBlock(ro as never, DEFAULT_GRAPHIC_STANDARD);
const texts = layout.items.filter((i): i is TemplateText => i.kind === 'text');
const lines = layout.items.flatMap((i) => (i.kind === 'line' ? [i] : []));
const KNOWN = new Set<string>([...BUILTIN_PARAMS, ...SOFT_BUILTINS]);
/** The datums F_01 requires beyond the original fields: registration number, professional titles, capacities, cerința, report number and date. */
const F01_PARAMS = ['RegistrationNumber', 'ProjectManagerTitle', 'DesignedByTitle', 'DrawnByTitle', 'AuthorsCapacity', 'VerifierCapacity', 'VerifierRequirement', 'ReportNumber', 'ReportDate'];
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
    for (const name of ['ProjectPhase', 'ProjectNumber', 'ProjectManager', 'DesignedBy', 'DrawnBy', 'CheckedBy', 'Organisation', 'Project', 'Address', 'Client', 'SheetNumber', 'SheetName', 'Scale', 'Date', 'Revision', ...F01_PARAMS]) assert.ok(used.includes(name), name);
    for (const name of used) assert.ok(KNOWN.has(name), `${name} is a built-in`);
  });

  it('keeps every value inside its cell with a margin, even a very long one, and below the cell\'s top rule', () => {
    for (const t of texts.filter((x) => x.text.startsWith('{'))) {
      const right = cellRight(t);
      // Wrapped or shrunk, every printed line stays in the cell: its right edge, the rule below it, the rule above it.
      const { size, lines } = fitCell(t, LONG);
      const { top, bottom } = cellRows(t);
      for (const { text, dy } of lines) {
        const printedRight = t.x + textWidthEm(text, t.bold) * size;
        assert.ok(printedRight <= right - 1, `${t.text} ends at ${printedRight.toFixed(1)} of ${right}`);
        assert.ok(t.y + dy <= bottom - 0.4, `${t.text} baseline ${t.y + dy} above the rule at ${bottom}`);
      }
      assert.ok(t.y + lines[0].dy - size * 0.72 >= top + 0.4, `${t.text} cap height clears the rule at ${top}`);
    }
  });

  it('keeps every caption inside its cell in Romanian and in English', () => {
    for (const say of [ro, en]) {
      const l = romanianTitleBlock(say as never, DEFAULT_GRAPHIC_STANDARD);
      for (const t of l.items.filter((i): i is TemplateText => i.kind === 'text' && !i.text.startsWith('{'))) {
        const { size, text } = fitText(t, t.text);
        assert.ok(t.x + textWidthEm(text) * size <= cellRight(t) - 1, `"${t.text}" fits`);
        assert.equal(text, t.text, `"${t.text}" is printed whole, not cut with an ellipsis`);
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
          assert.ok(out.texts.length >= texts.length, `${where}: every text prints, a wrapped one in more lines`);
        }
      }
    }
  });

  it('leaves four empty signature boxes (șef proiect, proiectat, desenat, verificator), captioned "Semnătura", and prints no stamp (F_01 names none)', () => {
    const boxes = texts.filter((t) => t.text === 'Semnătura');
    assert.equal(boxes.length, 4);
    for (const t of boxes) {
      const { top, bottom } = cellRows(t);
      assert.ok(cellRight(t) - t.x + 2 >= 20 && bottom - top >= TITLE_BLOCK_MM.h / RO_ROWS - 1e-9, 'a box to sign in');
      // Nothing else is printed in the box: no other text starts in it.
      const inside = texts.filter((o) => o !== t && o.x >= t.x - 2 && o.x < cellRight(t) && o.y > top && o.y <= bottom);
      assert.deepEqual(inside.map((o) => o.text), [], 'the box is empty');
    }
    assert.ok(!texts.some((t) => /ștampil/i.test(t.text)), 'no stamp caption');
    assert.ok(!Object.values(titleBlockRoRo).some((v) => /ștampil/i.test(String(v)) && v !== titleBlockRoRo['tblayout.roHint']), 'no stamp caption in the catalogue');
  });

  it('prints every datum F_01 requires: its caption, and the value when set (Ordinul 975/2026, Anexa 4)', () => {
    const captions = new Set(texts.filter((t) => !t.text.startsWith('{')).map((t) => t.text));
    // F_01's wording where the model has it: Titlu proiect, Titlu planșă, Planșa nr., Proiect nr., Faza, Scara, Data, Beneficiar, Șef proiect, Proiectat, Desenat, Cerința, Semnătura.
    for (const c of ['Titlu proiect', 'Titlu planșă', 'Planșa nr.', 'Proiect nr.', 'Faza', 'Scara', 'Data', 'Beneficiar', 'Șef proiect', 'Proiectat', 'Desenat', 'Verificator / expert', 'Cerința', 'Semnătura', 'Nr. înmatriculare / autorizație', 'Titlu profesional', 'Calitatea elaboratorilor', 'Calitatea', 'Referat / expertiză nr.']) assert.ok(captions.has(c), `caption "${c}"`);
    const values: Record<string, string> = {
      Organisation: 'Birou Alfa SRL', RegistrationNumber: 'J40/1234/2020', Client: 'Familia Popescu', Project: 'Casa Popescu', Address: 'Str. Lalelelor 3', SheetName: 'Plan parter', SheetNumber: 'A-101', Scale: '1:50', Date: '2026-10-26',
      ProjectPhase: 'PAC', ProjectNumber: 'P-2026-014', Revision: 'B', ProjectManager: 'Ion Ionescu', ProjectManagerTitle: 'arh. Ion Ionescu', DesignedBy: 'Ana Popescu', DesignedByTitle: 'arh.', DrawnBy: 'D. Marin', DrawnByTitle: 'desenator',
      AuthorsCapacity: 'proiectant arhitectură', CheckedBy: 'Mihai Radu', VerifierCapacity: 'verificator atestat', VerifierRequirement: 'A1', ReportNumber: 'RV-77', ReportDate: '2026-10-20',
    };
    const out = printTitleBlock(layout, (n) => values[n] ?? `{${n}?}`, { x: 0, y: 0, ...TITLE_BLOCK_MM }, false);
    const printedTexts = out.texts.map((t) => t.text);
    for (const [name, value] of Object.entries(values)) assert.ok(printedTexts.includes(value), `${name} prints "${value}"`);
    // Every F_01 param has a field that fills it, so a typed value reaches the cell.
    for (const p of F01_PARAMS) assert.ok(Object.values(FIELD_PARAMS).includes(p as never), `${p} is filled from a title block field`);
    assert.ok(F01_PARAMS.every((p) => (TITLE_BLOCK_FIELDS as readonly string[]).includes(Object.entries(FIELD_PARAMS).find(([, v]) => v === p)![0])), 'and each field is a title block field');
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
