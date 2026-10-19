/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The issued PDF, read back with pdf.js: a bookmark per sheet in set order, the sheet's layers as PDF layers with the
 * drawing inside the right one, and the scale: a 1 m line drafted in views placed at 1:50 and 1:100 measures 20 mm and
 * 10 mm on the page. The sheets are drawn by the real sheet paper (`captureSheets`) and written by the real builder.
 */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as jspdf from 'jspdf';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { openPdf, strokedSegments } from '@/test/pdf-read.js';
import { captureSheets } from './capture.js';
import { buildIssuePdf } from './pdf-build.js';
import { pdfLabels, planFor } from './run.js';

const vp = (id: string, viewId: string, scale: number, y: number) => ({ id, viewId, x: 100, y, scale, width: 150, height: 60, center: null });
const sheet = (id: string, number: string, name: string, viewports: ReturnType<typeof vp>[]) =>
  ({ id, number, name, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports }) as unknown as ProjectSheet;

/** A plan view that is "drawn" (empty) and carries a 1 m line on the drafting layer "Walls". */
function reference(): string {
  const view = addProjectView({ kind: 'plan', name: 'Ground floor plan', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
  useViewDrawings.setState({ byView: { [view]: { ...EMPTY_VIEW_DRAWING, status: 'ready' } } });
  useProjectStore.setState({
    draftLayers: [{ id: 'L1', name: 'Walls', color: '#000000', visible: true, locked: false, lineWeight: 0.35 }],
    drafts: [{ id: 'd1', viewId: view, layerId: 'L1', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params: {} }],
  });
  return view;
}

/** The fonts as the browser fetches them from `public/`. */
const loadFont = async (url: string) => new Uint8Array(readFileSync(new URL(`../../public${url}`, import.meta.url)));

async function issued(options: { archival?: boolean; romanian?: boolean } = {}) {
  const view = reference();
  if (options.romanian) {
    useProjectStore.setState({ titleBlock: { drawnBy: 'Proiectant: Ștefan Țepeș' } });
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => ({ ...v, name: 'Cameră înaltă â' })) });
  }
  const sheets = [
    sheet('s2', 'A-102', 'Second floor plan', [vp('p3', view, 100, 100)]),
    sheet('s1', 'A-101', options.romanian ? 'Secțiune longitudinală' : 'Ground floor plan', [vp('p1', view, 50, 100), vp('p2', view, 100, 200)]),
  ];
  useProjectStore.setState({ sheets });
  const plan = planFor({ name: 'P01', date: '2026-10-19', listFirst: true });
  const drawn = await captureSheets(plan.sheets.map((s) => s.sheet));
  assert.deepEqual(drawn.failed, []);
  const window = globalThis.window as unknown as { jspdf?: typeof jspdf };
  const prior = window.jspdf;
  window.jspdf = jspdf;
  try {
    return await buildIssuePdf(plan, drawn.svgs, 'House', pdfLabels(), { loadFont, archival: options.archival, created: new Date(2026, 9, 19, 12, 0, 0) });
  } finally {
    window.jspdf = prior;
  }
}

beforeEach(() => {
  resetProject();
  useViewDrawings.setState({ byView: {} });
});

async function pageText(bytes: Uint8Array, n: number): Promise<string> {
  const { pdf, close } = await openPdf(bytes);
  try {
    const page = await pdf.getPage(n);
    return (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
  } finally { await close(); }
}

describe('the issued PDF', () => {
  it('keeps Romanian diacritics in the drawing list, the sheet text and the bookmarks', async () => {
    const bytes = await issued({ romanian: true });
    assert.ok((await pageText(bytes, 1)).includes('Secțiune longitudinală'), 'drawing list');
    const sheetText = await pageText(bytes, 2);
    for (const expected of ['Proiectant: Ștefan Țepeș', 'Secțiune longitudinală', 'Cameră înaltă â']) assert.ok(sheetText.includes(expected), `${expected} in: ${sheetText}`);
    const { pdf, close } = await openPdf(bytes);
    try {
      assert.deepEqual(((await pdf.getOutline()) ?? []).map((o) => o.title), ['Drawing list', 'A-101 Secțiune longitudinală', 'A-102 Second floor plan']);
    } finally { await close(); }
  });

  it('has a bookmark per sheet, number and name, in set order after the drawing list', async () => {
    const { pdf, close } = await openPdf(await issued());
    try {
      assert.equal(pdf.numPages, 3);
      const outline = (await pdf.getOutline()) ?? [];
      assert.deepEqual(outline.map((o) => o.title), ['Drawing list', 'A-101 Ground floor plan', 'A-102 Second floor plan']);
      const pages = await Promise.all(outline.map((o) => pdf.getPageIndex((o.dest as [Parameters<typeof pdf.getPageIndex>[0]])[0])));
      assert.deepEqual(pages, [0, 1, 2]);
    } finally { await close(); }
  });

  it('puts each sheet on a page of its own paper size', async () => {
    const { pdf, close } = await openPdf(await issued());
    try {
      const mm = async (n: number) => (await pdf.getPage(n)).view.slice(2).map((v) => Math.round((v * 25.4) / 72));
      assert.deepEqual([await mm(1), await mm(2), await mm(3)], [[210, 297], [420, 297], [420, 297]]);
    } finally { await close(); }
  });

  it('has a layer per category and per drafting layer, and the drawing is inside its own', async () => {
    const { pdf, pdfjs, close } = await openPdf(await issued());
    try {
      const config = await pdf.getOptionalContentConfig();
      const names = [...config].map(([, group]) => group.name);
      for (const expected of ['Frame', 'Title block', 'View titles', 'Drafting: Walls']) assert.ok(names.includes(expected), `${expected} in ${names.join(', ')}`);
      assert.equal(new Set(names).size, names.length, 'one layer per name for the whole document');
      const walls = (await strokedSegments(pdf, pdfjs, 2)).filter((s) => s.layer === 'Drafting: Walls' && s.length > 5);
      assert.equal(walls.length, 2, 'the two 1 m lines, and nothing else, are on the drafting layer');
      const frame = (await strokedSegments(pdf, pdfjs, 2)).filter((s) => s.layer === 'Frame');
      assert.ok(frame.length >= 4);
      const [id] = [...config].find(([, group]) => group.name === 'Drafting: Walls') ?? [];
      assert.ok(id);
      assert.equal(config.isVisible({ type: 'OCG', id }), true);
      config.setVisibility(id, false);
      assert.equal(config.isVisible({ type: 'OCG', id }), false, 'a reader can switch it off');
    } finally { await close(); }
  });

  it('measures a 1 m line at 1:50 as 20 mm and at 1:100 as 10 mm on the page', async () => {
    const { pdf, pdfjs, close } = await openPdf(await issued());
    try {
      const walls = (await strokedSegments(pdf, pdfjs, 2)).filter((s) => s.layer === 'Drafting: Walls' && s.length > 5).sort((a, b) => a.y1 - b.y1);
      assert.equal(walls.length, 2);
      const [fifty, hundred] = walls;
      assert.ok(Math.abs(fifty.length - 20) < 0.1, `1:50 measures ${fifty.length} mm`);
      assert.ok(Math.abs(hundred.length - 10) < 0.1, `1:100 measures ${hundred.length} mm`);
      // And they sit where the sheet put them: the viewports' centres at x 100 mm, y 100 and 200 mm from the top.
      assert.ok(Math.abs(fifty.x1 - 100) < 0.1 && Math.abs(fifty.y1 - 100) < 0.1, `1:50 starts at ${fifty.x1}, ${fifty.y1}`);
      assert.ok(Math.abs(hundred.x1 - 100) < 0.1 && Math.abs(hundred.y1 - 200) < 0.1, `1:100 starts at ${hundred.x1}, ${hundred.y1}`);
    } finally { await close(); }
  });

  it('writes the archival description only when asked', async () => {
    const plain = new TextDecoder('latin1').decode(await issued());
    assert.ok(!plain.includes('/OutputIntents') && !plain.includes('pdfaid'));
    const bytes = await issued({ archival: true });
    const text = new TextDecoder('latin1').decode(bytes);
    assert.match(text, /^%PDF-1\.7/);
    assert.match(text, /\/OutputIntents \[<< \/Type \/OutputIntent \/S \/GTS_PDFA1 /);
    const { pdf, close } = await openPdf(bytes);
    try {
      const { metadata } = await pdf.getMetadata();
      assert.equal(metadata?.get('pdfaid:part'), '2');
      assert.equal(metadata?.get('pdfaid:conformance'), 'B');
      assert.equal(metadata?.get('dc:title'), 'House P01');
      assert.equal(metadata?.get('xmp:createdate'), '2026-10-19T12:00:00' + metadata?.get('xmp:createdate')?.slice(19));
    } finally { await close(); }
  });
});
