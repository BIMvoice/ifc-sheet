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
import { deflateSync } from 'node:zlib';
import * as jspdf from 'jspdf';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { openPdf, strokedSegments } from '@/test/pdf-read.js';
import { fontFamilyOf } from '@/drafting/text-width';
import { captureSheets } from './capture.js';
import { buildIssuePdf, type PdfWarning } from './pdf-build.js';
import type { FontLoader } from './pdf-fonts.js';
import { pdfLabels, planFor } from './run.js';

const vp = (id: string, viewId: string, scale: number, y: number) => ({ id, viewId, x: 100, y, scale, width: 150, height: 60, center: null });
const sheet = (id: string, number: string, name: string, viewports: ReturnType<typeof vp>[]) =>
  ({ id, number, name, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports }) as unknown as ProjectSheet;

/**
 * The generated drawing of the plan: one wall cut 4 m by 0.3 m, centred on the origin, so the page carries
 * a fill, cut lines and (the view's walls are hatched BRICK) hatch lines, each inside its own layer.
 */
const WALL_CUT = [{ x: -2, y: -0.15 }, { x: 2, y: -0.15 }, { x: 2, y: 0.15 }, { x: -2, y: 0.15 }];
const DRAWING = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 10, includeHiddenLines: true, creaseAngle: 30, scale: 100 },
  lines: WALL_CUT.map((a, i) => ({ line: { start: a, end: WALL_CUT[(i + 1) % 4] }, category: 'cut', visibility: 'visible', entityId: 7, ifcType: 'IfcWall', modelIndex: 0, depth: 0 })),
  cutPolygons: [{ polygon: { outer: WALL_CUT, holes: [] }, entityId: 7, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: -2, y: -0.15 }, max: { x: 2, y: 0.15 } },
  stats: { cutLineCount: 4, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;

/** A 4 x 4 px red PNG, as a title-block logo is stored: a data URL. */
function logoPng(): string {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(4 + typed.length + 4);
    out.writeUInt32BE(data.length, 0);
    typed.copy(out, 4);
    out.writeUInt32BE(crc(typed), 4 + typed.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, ...Array.from({ length: 4 }, () => [255, 0, 0]).flat()])));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** A plan view with a generated drawing (`DRAWING`, its walls hatched) and a 1 m line on the drafting layer "Walls". */
function reference(): string {
  const view = addProjectView({ kind: 'plan', name: 'Ground floor plan', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100, graphics: { categories: { walls: { cutHatch: 'BRICK' } } } } as never);
  useViewDrawings.setState({ byView: { [view]: { ...EMPTY_VIEW_DRAWING, drawing: DRAWING, status: 'ready' } } });
  useProjectStore.setState({
    draftLayers: [{ id: 'L1', name: 'Walls', color: '#000000', visible: true, locked: false, lineWeight: 0.35 }],
    drafts: [{ id: 'd1', viewId: view, layerId: 'L1', shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params: {} }],
  });
  return view;
}

/** The fonts as the browser fetches them from `public/`. */
const loadFont = async (url: string) => new Uint8Array(readFileSync(new URL(`../../public${url}`, import.meta.url)));

async function issued(options: { archival?: boolean; romanian?: boolean; drawnBy?: string; logo?: string; extraText?: string; loadFont?: FontLoader; warnings?: PdfWarning[] } = {}) {
  const view = reference();
  if (options.logo) useProjectStore.setState({ titleBlock: { logo: options.logo } });
  if (options.romanian) {
    useProjectStore.setState({ titleBlock: { drawnBy: 'Proiectant: Ștefan Țepeș' } });
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => ({ ...v, name: 'Cameră înaltă â' })) });
  }
  if (options.drawnBy) useProjectStore.setState({ titleBlock: { drawnBy: options.drawnBy } });
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
    if (options.extraText) for (const [k, v] of drawn.svgs) drawn.svgs.set(k, v.replace(/<\/svg>\s*$/, `${options.extraText}</svg>`));
    return await buildIssuePdf(plan, drawn.svgs, 'House', pdfLabels(), {
      loadFont: options.loadFont ?? loadFont, archival: options.archival, created: new Date(2026, 9, 19, 12, 0, 0), onWarning: (w) => options.warnings?.push(w),
    });
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

      // Review of #110: the generated drawing, drawn inside its own layers, keeps the scale too. The 4 m cut
      // edges of the wall measure 80 mm at 1:50 and 40 mm at 1:100, and its hatch lies inside the cut.
      const segments = await strokedSegments(pdf, pdfjs, 2);
      const cut = segments.filter((s) => s.layer === 'Cut lines');
      const long = cut.map((s) => s.length).filter((l) => l > 30).sort((a, b) => a - b);
      assert.equal(long.length, 4, `two long cut edges per viewport, got ${cut.map((s) => s.length.toFixed(2)).join(', ')}`);
      for (const [l, want] of long.map((l, i) => [l, i < 2 ? 40 : 80])) assert.ok(Math.abs(l - want) < 0.1, `a cut edge measures ${l} mm, expected ${want}`);
      const hatch = segments.filter((s) => s.layer === 'Hatching');
      assert.ok(hatch.length > 10, `the wall is hatched (${hatch.length} hatch lines)`);
      const fiftyCut = cut.filter((s) => Math.abs(s.y1 - 100) < 4);
      const [minX, maxX] = [Math.min(...fiftyCut.flatMap((s) => [s.x1, s.x2])), Math.max(...fiftyCut.flatMap((s) => [s.x1, s.x2]))];
      const [minY, maxY] = [Math.min(...fiftyCut.flatMap((s) => [s.y1, s.y2])), Math.max(...fiftyCut.flatMap((s) => [s.y1, s.y2]))];
      assert.ok(Math.abs(maxX - minX - 80) < 0.1 && Math.abs(maxY - minY - 6) < 0.1, `the 1:50 wall is ${maxX - minX} by ${maxY - minY} mm`);
      for (const s of hatch.filter((h) => Math.abs(h.y1 - 100) < 4)) {
        for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) assert.ok(x > minX - 0.1 && x < maxX + 0.1 && y > minY - 0.1 && y < maxY + 0.1, `hatch point ${x}, ${y} inside the cut`);
      }
    } finally { await close(); }
  });

  // Review of #110: /Properties was opened inside the /XObject dictionary before addImage wrote its names, so
  // the image's /I0 landed in /Properties and the logo was not drawn.
  it('draws the title-block logo: the image is a page XObject and the page paints it', async () => {
    const { pdf, pdfjs, close } = await openPdf(await issued({ logo: logoPng() }));
    try {
      for (const n of [2, 3]) {
        const page = await pdf.getPage(n);
        const ops = await page.getOperatorList();
        const at = ops.fnArray.indexOf(pdfjs.OPS.paintImageXObject);
        assert.ok(at >= 0, `page ${n} paints an image`);
        // pdf.js passes the image XObject's id and its pixel size.
        assert.deepEqual((ops.argsArray[at] as unknown[]).slice(1, 3), [4, 4], `page ${n}: the logo's own pixels`);
      }
      const config = await pdf.getOptionalContentConfig();
      assert.ok([...config].some(([, group]) => group.name === 'Title block'), 'the layers are still there');
    } finally { await close(); }
  });

  // Review of #110: the file claimed PDF/A-2b (pdfaid part 2, conformance B) though jsPDF cannot write a conforming
  // file and no validator was run; archives trust that claim, so the archival metadata carries none.
  it('writes the archival metadata only when asked, and claims no PDF/A conformance', async () => {
    const plain = new TextDecoder('latin1').decode(await issued());
    assert.ok(!plain.includes('/OutputIntents') && !plain.includes('pdfaid'));
    const bytes = await issued({ archival: true });
    const text = new TextDecoder('latin1').decode(bytes);
    assert.match(text, /^%PDF-1\.7/);
    assert.match(text, /\/OutputIntents \[<< \/Type \/OutputIntent \/S \/GTS_PDFA1 /);
    const { pdf, close } = await openPdf(bytes);
    try {
      const { metadata } = await pdf.getMetadata();
      assert.ok(metadata, 'the XMP packet is written');
      assert.equal(metadata.get('pdfaid:part'), null);
      assert.equal(metadata.get('pdfaid:conformance'), null);
      assert.ok(!metadata.getRaw().includes('pdfa'), `no PDF/A identification in the XMP: ${metadata.getRaw()}`);
      assert.equal(metadata?.get('dc:title'), 'House P01');
      assert.equal(metadata?.get('xmp:createdate'), '2026-10-19T12:00:00' + metadata?.get('xmp:createdate')?.slice(19));
    } finally { await close(); }
  });

  // Review of #110: a font that failed to load threw out of the builder, so nothing was issued.
  it('still issues, on the standard font, when the PDF font cannot be loaded, and says so', async () => {
    const warnings: PdfWarning[] = [];
    const bytes = await issued({ warnings, loadFont: async (url) => { throw new Error(`404 ${url}`); } });
    const { pdf, close } = await openPdf(bytes);
    try { assert.equal(pdf.numPages, 3); } finally { await close(); }
    assert.ok((await pageText(bytes, 1)).includes('Ground floor plan'), 'the drawing list is written');
    assert.deepEqual(warnings.map((w) => w.key), ['issue.msg.fontMissing']);
  });

  // Review of #110: Inter has no CJK glyphs; the characters it cannot show are named, the ones it can are not.
  it('names the characters the PDF font has no glyph for', async () => {
    const warnings: PdfWarning[] = [];
    const bytes = await issued({ warnings, drawnBy: '设计 王 Ștefan' });
    assert.ok((await pageText(bytes, 2)).includes('Ștefan'), 'the Romanian text is still written');
    assert.deepEqual(warnings, [{ key: 'issue.msg.missingGlyphs', params: { chars: '设 计 王' } }]);
  });

  // Review of #110: every text was set in Inter, whatever font its text style asked for.
  it('draws serif and monospace text in Times and Courier, and sans-serif text in Inter', async () => {
    const extraText = `<text x="50" y="50" font-size="5" font-family="${fontFamilyOf('serif')}">Facade Nord</text>`
      + `<text x="50" y="60" font-size="5" font-family="${fontFamilyOf('mono')}">W-01 mono</text>`;
    const { pdf, close } = await openPdf(await issued({ extraText }), { fontExtraProperties: true });
    try {
      const page = await pdf.getPage(2);
      const items = (await page.getTextContent()).items.filter((i) => 'str' in i);
      await page.getOperatorList(); // loads the page's fonts into commonObjs
      const fontOf = (text: string) => {
        const item = items.find((i) => 'str' in i && i.str === text);
        assert.ok(item && 'fontName' in item, `${text} is on the page`);
        return (page.commonObjs.get(item.fontName) as { name: string }).name;
      };
      assert.equal(fontOf('Facade Nord'), 'Times-Roman');
      assert.equal(fontOf('W-01 mono'), 'Courier');
      assert.equal(fontOf('Ground floor plan'), 'Inter');
    } finally { await close(); }
  });

  it('says nothing when every letter has a glyph', async () => {
    const warnings: PdfWarning[] = [];
    await issued({ warnings, romanian: true });
    assert.deepEqual(warnings, []);
  });

  // Review of #110: the font files were fetched from /fonts/ whatever the app's base path.
  it('reads the font files from under the app base path', async () => {
    const env = (globalThis as { __VITE_ENV__?: Record<string, unknown> }).__VITE_ENV__;
    assert.ok(env, 'the test env object the modules read import.meta.env from');
    const prior = env.BASE_URL;
    env.BASE_URL = '/ifcsheet/';
    const asked: string[] = [];
    try {
      await issued({ loadFont: async (url) => { asked.push(url); return loadFont(url.replace('/ifcsheet', '')); } });
    } finally { env.BASE_URL = prior; }
    assert.deepEqual(asked.sort(), ['/ifcsheet/fonts/Inter-Bold.ttf', '/ifcsheet/fonts/Inter-Regular.ttf']);
  });
});
