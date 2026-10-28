/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities on the paper like the other column schedules (#186, #75): a table longer than the sheet continues on A-6xx.1... with every
 * article on exactly one page and the header repeated, each page inside the frame, and a small one is one sheet. The article codes are EXAMPLES.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBoq, newArticle, boqSayFor } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { addSchedule } from '@/joinery/schedules.js';
import { layoutBoq } from '@/joinery/boq-layout.js';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { hangSchedule } from './drawing-set-actions.js';
import { resetProject, useProjectStore } from './project-store.js';
import { frameOf, frameRect } from './sheet-frame.js';
import { paperOf } from './sheets.js';
import { layoutTableOnSheet, syncSchedulePages } from './schedule-fit.js';
import type { ProjectSheet } from './types';

const sheets = () => useProjectStore.getState().sheets;
const holders = (id: string) => sheets().filter((s) => (s.viewports ?? []).some((v) => v.viewId === id)).sort((a, b) => a.number.localeCompare(b.number));
const articles = (n: number) => Array.from({ length: n }, (_, i) => ({ ...newArticle(`a${i}`, 'm3'), code: `EXAMPLE-${String(i + 1).padStart(3, '0')}`, description: `EXAMPLE: article ${i + 1}`, typeName: 'T240' }));
const layoutOf = (n: number, sheet: ProjectSheet, detail = false) => layoutTableOnSheet(
  { sheets: sheets(), sheet, vp: sheet.viewports![0] },
  (paging) => layoutBoq(computeBoq([], articles(n)), { locale: 'ro', title: 'Antemăsurătoare', say: boqSayFor('ro'), detail }, paging),
);

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('the bill of quantities on sheets', () => {
  it('a long table continues on A-6xx.1... with every article on one page, the header repeated and each page inside its frame', () => {
    const id = addSchedule('boq', 'Antemăsurătoare');
    assert.ok(hangSchedule(id));
    syncSchedulePages(id, layoutOf(80, holders(id)[0]).pages!);
    const held = holders(id);
    assert.ok(held.length > 1, `80 articles need continuation sheets (${held.length})`);
    const seen = new Map<string, number>();
    for (const sheet of held) {
      const layout = layoutOf(80, sheet);
      assert.equal(layout.pages, held.length);
      assert.ok(layout.height <= layout.fit!.box.h + 1e-6, `${sheet.number}: ${layout.height} within ${layout.fit!.box.h}`);
      const texts = layout.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
      // A page that carries articles repeats the header; one that carries only the notes that follow the last article has no table.
      if (texts.some((t) => /^EXAMPLE-\d{3}$/.test(t))) assert.ok(texts.includes('Cod articol'), `${sheet.number} repeats the header`);
      for (const t of texts) if (/^EXAMPLE-\d{3}$/.test(t)) seen.set(t, (seen.get(t) ?? 0) + 1);
      let svg: SVGSVGElement | null = null;
      render(<SheetPaper ref={(s) => { svg = s; }} sheet={sheet} projectName="P" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view: undefined, drawing: null, drafts: [], schedule: layout })} />);
      assert.ok(svg);
      const clip = (svg as SVGSVGElement).querySelector('clipPath rect')!;
      const frame = frameRect(paperOf(sheet), frameOf(sheet));
      const r = { x: Number(clip.getAttribute('x')), y: Number(clip.getAttribute('y')), w: Number(clip.getAttribute('width')), h: Number(clip.getAttribute('height')) };
      assert.ok(r.x >= frame.x && r.y >= frame.y && r.x + r.w <= frame.x + frame.w + 1e-6 && r.y + r.h <= frame.y + frame.h + 1e-6, `${sheet.number}: the box lies in the frame`);
      cleanup();
    }
    assert.equal(seen.size, 80, 'every article is on a page');
    assert.deepEqual([...seen.values()].filter((n) => n !== 1), [], 'and on exactly one');
  });

  it('a small table is one sheet, and its notes (what no element matches) are under it inside the frame', () => {
    const id = addSchedule('boq', 'Antemăsurătoare');
    hangSchedule(id);
    syncSchedulePages(id, layoutOf(3, holders(id)[0]).pages!);
    assert.equal(holders(id).length, 1);
    const layout = layoutOf(3, holders(id)[0]);
    assert.equal(layout.pages, 1);
    const texts = layout.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    assert.ok(texts.some((t) => t.startsWith('EXAMPLE-001: niciun element nu corespunde')), 'the note under the table');
  });

  it('a long description is cut at its column with an ellipsis on paper and a long note wraps inside the table\'s width', () => {
    const long = { ...articles(1)[0], description: 'EXAMPLE: '.concat('o descriere foarte lungă '.repeat(12)) };
    const layout = layoutBoq(computeBoq([], [long]), { locale: 'ro', title: 'T', say: boqSayFor('ro'), detail: false });
    const texts = layout.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    assert.ok(texts.some((t) => t.startsWith('EXAMPLE: o descriere') && t.endsWith('…')));
    assert.ok(layout.width >= 190);
    const right = Math.max(...layout.prims.map((p) => (p.kind === 'line' ? Math.max(p.x1, p.x2) : p.kind === 'text' ? p.x : 0)));
    assert.ok(right <= layout.width + 1e-6);
  });
});
