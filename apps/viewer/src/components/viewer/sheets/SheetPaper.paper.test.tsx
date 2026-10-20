/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { BUILT_IN_TEMPLATES, templateFields } from '@/project/sheet-templates';
import { frameRect, titleBlockRect } from '@/project/sheet-frame';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from './SheetPaper';
import { sheetPrintHtml, sheetSvgText } from './sheet-export';

/**
 * What the sheet SVG says of its paper, frame and title block: the one document
 * SVG, PDF (print) and DXF all read. Sizes are the exported SVG's, in mm.
 */

afterEach(() => cleanup());

const base: ProjectSheet = { id: 's', number: 'A-901', name: 'Long elevation', createdAt: 0, viewports: [] };

function exported(sheet: ProjectSheet): { doc: Document; svg: SVGSVGElement; text: string } {
  const ui = render(
    <SheetPaper sheet={sheet} projectName="House" content={() => ({ view: undefined, drawing: null, drafts: [] })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
  );
  const live = ui.querySelector('svg');
  assert.ok(live);
  const text = sheetSvgText(live as unknown as SVGSVGElement, sheet);
  const doc = new DOMParser().parseFromString(text.replace(/^<\?xml[^>]*>\s*/, ''), 'image/svg+xml');
  return { doc, svg: doc.documentElement as unknown as SVGSVGElement, text };
}

const num = (el: Element, name: string) => Number(el.getAttribute(name));

/** The title block's corners on the paper, from its transform (a translate, and a quarter turn for the strip). */
function titleBlockBox(doc: Document): { x0: number; y0: number; x1: number; y1: number; strip: boolean } {
  const g = doc.querySelector('[data-dxf-layer="TITLEBLOCK"]');
  assert.ok(g);
  const m = /translate\(([-\d.]+) ([-\d.]+)\)(?: rotate\(-90\))?/.exec(g.getAttribute('transform') ?? '');
  assert.ok(m, g.getAttribute('transform') ?? 'a transform');
  const [x, y] = [Number(m[1]), Number(m[2])];
  const strip = (g.getAttribute('transform') ?? '').includes('rotate');
  // Drawn 180 × 50 at its own origin: a strip turns it a quarter, so it stands 50 wide from (x, y - 180).
  return strip ? { x0: x, y0: y - 180, x1: x + 50, y1: y, strip } : { x0: x, y0: y, x1: x + 180, y1: y + 50, strip };
}

function assertFrameAndTitleBlock(sheet: ProjectSheet, doc: Document): void {
  const { w, h } = paperOf(sheet);
  const frame = doc.querySelector('[data-dxf-layer="FRAME"]');
  assert.ok(frame);
  const margins = sheet.frame?.margins ?? { top: 10, right: 10, bottom: 10, left: 10 };
  assert.deepEqual([num(frame, 'x'), num(frame, 'y'), num(frame, 'width'), num(frame, 'height')], [margins.left, margins.top, w - margins.left - margins.right, h - margins.top - margins.bottom], 'the frame sits at the margins');
  const box = titleBlockBox(doc);
  assert.ok(box.x0 >= margins.left && box.y0 >= margins.top && box.x1 <= w - margins.right && box.y1 <= h - margins.bottom, 'the title block is inside the frame');
  assert.equal(box.x1, w - margins.right, 'against the right of the frame');
  assert.equal(box.y1, h - margins.bottom, 'against the bottom of the frame');
}

describe('the sheet SVG on a paper of any size', () => {
  it('A3×3 landscape is 891 × 420 mm, with the frame at the template margins and the title block inside it', () => {
    const sheet: ProjectSheet = { ...base, paper: { kind: 'elongated', base: 'A3', factor: 3 }, orientation: 'landscape' };
    const { doc, svg, text } = exported(sheet);
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')], ['891mm', '420mm', '0 0 891 420']);
    assert.match(text, /width="891mm" height="420mm"/);
    assertFrameAndTitleBlock(sheet, doc);
    assert.equal(titleBlockBox(doc).strip, false);
  });

  it('A3×3 portrait is 420 × 891 mm', () => {
    const sheet: ProjectSheet = { ...base, paper: { kind: 'elongated', base: 'A3', factor: 3 }, orientation: 'portrait' };
    const { doc, svg } = exported(sheet);
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height')], ['420mm', '891mm']);
    assertFrameAndTitleBlock(sheet, doc);
  });

  it('a custom 500 × 700 mm sheet is exactly that, and the print page is the same size', () => {
    const sheet: ProjectSheet = { ...base, paper: { kind: 'custom', widthMm: 500, heightMm: 700 }, orientation: 'portrait' };
    const { doc, svg } = exported(sheet);
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')], ['500mm', '700mm', '0 0 500 700']);
    assertFrameAndTitleBlock(sheet, doc);
    const live = render(<SheetPaper sheet={sheet} projectName="House" content={() => ({ view: undefined, drawing: null, drafts: [] })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />).querySelector('svg');
    assert.match(sheetPrintHtml(live as unknown as SVGSVGElement, sheet), /@page\{size:500mm 700mm;margin:0\}/);
  });

  it('puts the frame and the title block at a template\'s margins and title block position', () => {
    const details = BUILT_IN_TEMPLATES.find((t) => t.id === 'builtin:a3-details')!;
    const sheet: ProjectSheet = { ...base, ...templateFields(details) };
    const { doc, svg } = exported(sheet);
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height')], ['420mm', '297mm']);
    assertFrameAndTitleBlock(sheet, doc);
    // The 20 mm binding margin on the left.
    assert.equal(num(doc.querySelector('[data-dxf-layer="FRAME"]')!, 'x'), 20);
    assert.deepEqual(titleBlockBox(doc), { x0: 420 - 10 - 180, y0: 297 - 10 - 50, x1: 410, y1: 287, strip: false });
  });

  it('a title block strip stands down the right of the frame, on an elongated and on a custom sheet', () => {
    for (const paper of [{ kind: 'elongated', base: 'A3', factor: 3 }, { kind: 'custom', widthMm: 500, heightMm: 700 }] as const) {
      const sheet: ProjectSheet = {
        ...base, paper, orientation: 'landscape', frame: { margins: { top: 8, right: 12, bottom: 9, left: 20 }, titleBlock: 'right' },
      };
      const { doc } = exported(sheet);
      assertFrameAndTitleBlock(sheet, doc);
      const box = titleBlockBox(doc);
      assert.equal(box.strip, true);
      assert.deepEqual([box.x1 - box.x0, box.y1 - box.y0], [50, 180]);
      // The geometry the SVG draws is the geometry the drawing area is worked out from.
      const { w, h } = paperOf(sheet);
      const tb = titleBlockRect({ w, h }, sheet.frame!);
      assert.deepEqual([box.x0, box.y0, box.x1, box.y1], [tb.x, tb.y, tb.x + tb.w, tb.y + tb.h]);
      assert.deepEqual(frameRect({ w, h }, sheet.frame!), { x: 20, y: 8, w: w - 32, h: h - 17 });
    }
  });

  it('a sheet with no frame of its own keeps the standard one: 10 mm all round, title block bottom right', () => {
    const sheet: ProjectSheet = { ...base, paper: 'A1', orientation: 'landscape' };
    const { doc, svg } = exported(sheet);
    assert.deepEqual([svg.getAttribute('width'), svg.getAttribute('height')], ['841mm', '594mm']);
    assertFrameAndTitleBlock(sheet, doc);
    assert.deepEqual(titleBlockBox(doc), { x0: 651, y0: 534, x1: 831, y1: 584, strip: false });
  });
});
