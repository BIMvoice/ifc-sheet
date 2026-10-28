/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #500: schedules, reports and the drawing register follow the project's "Tables" text style. The drawing register is
 * put on a sheet; the sheet is drawn by the real sheet paper (`captureSheets`), written to PDF by the real builder and to DXF by
 * the real walker. Switching the style to serif changes the text font in all three; a project without the style prints as before.
 */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as jspdf from 'jspdf';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet, addRegisterToSet } from '@/project/drawing-set-actions';
import { addTablesStyle, updateTextStyle } from '@/project/drafting-standards';
import { fontFamilyOf } from '@/drafting/text-width';
import { captureSheets } from './capture.js';
import { buildIssuePdf } from './pdf-build.js';
import { pdfLabels, planFor } from './run.js';

const loadFont = async (url: string) => new Uint8Array(readFileSync(new URL(`../../public${url}`, import.meta.url)));
const SANS = fontFamilyOf('sans');
const SERIF = fontFamilyOf('serif');

async function issued(): Promise<{ svg: string; dxf: string; pdf: string }> {
  startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
  const register = addRegisterToSet('Drawing register');
  const sheet = useProjectStore.getState().sheets.find((s) => s.id === register)!;
  const plan = planFor({ name: 'P01', date: '2026-10-27', listFirst: false });
  const drawn = await captureSheets([sheet], { dxf: true });
  assert.deepEqual(drawn.failed, []);
  const window = globalThis.window as unknown as { jspdf?: typeof jspdf };
  const prior = window.jspdf;
  window.jspdf = jspdf;
  try {
    const bytes = await buildIssuePdf(plan, drawn.svgs, 'House', pdfLabels(), { loadFont, created: new Date(2026, 9, 27, 12, 0, 0) });
    const svg = [...drawn.svgs.values()].join('\n');
    const dxfBytes = [...(drawn.dxfs?.values() ?? [])][0];
    return { svg, dxf: dxfBytes ? new TextDecoder().decode(dxfBytes) : '', pdf: Buffer.from(bytes).toString('latin1') };
  } finally {
    window.jspdf = prior;
  }
}

/** The register's own text: the `SCHEDULE` layer's `<text>` tags. */
const scheduleText = (svg: string): string[] => [...svg.matchAll(/<text\b[^>]*data-dxf-layer="SCHEDULE"[^>]*>/g)].map((m) => m[0]);

/**
 * The fonts the page's text is drawn with: every `/Fn size Tf` of the content streams, resolved through the font resources to the
 * font object's `/BaseFont` (the file lists all fourteen standard fonts whether or not they are used, so the listing proves nothing).
 */
function usedFonts(pdf: string): Set<string> {
  const base = new Map<string, string>();
  for (const m of pdf.matchAll(/(\d+) 0 obj\s*<<[^>]*?\/BaseFont\s*\/([^\s/>]+)/g)) base.set(m[1], m[2].replace(/^[A-Z]{6}\+/, ''));
  const resource = new Map<string, string>();
  for (const m of pdf.matchAll(/\/(F\d+)\s+(\d+) 0 R/g)) resource.set(m[1], base.get(m[2]) ?? '?');
  const out = new Set<string>();
  for (const stream of pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let text: string;
    try { text = inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const m of text.matchAll(/\/(F\d+)\s+[\d.]+\s+Tf/g)) out.add(resource.get(m[1]) ?? '?');
  }
  return out;
}

beforeEach(() => resetProject());

describe('the Tables text style (#500)', () => {
  it('leaves a project without the style as it was: the sans face, no new attribute, no Times on the page, DXF text in Standard', async () => {
    const { svg, dxf, pdf } = await issued();
    const tags = scheduleText(svg);
    assert.ok(tags.length > 0, 'the register has text');
    for (const tag of tags) {
      assert.ok(tag.includes(`font-family="${SANS}"`), tag);
      assert.doesNotMatch(tag, /font-style|data-dxf-font/, tag);
    }
    assert.deepEqual([...usedFonts(pdf)], ['Inter'], 'the page is set in the embedded Inter alone');
    assert.doesNotMatch(dxf, /Tables/);
  });

  it('switching it to serif changes the register text in the sheet SVG, the PDF and the DXF', async () => {
    updateTextStyle(addTablesStyle('Tables'), { font: 'serif' });
    const { svg, dxf, pdf } = await issued();
    const tags = scheduleText(svg);
    assert.ok(tags.length > 0);
    for (const tag of tags) assert.ok(tag.includes(`font-family="${SERIF}"`), tag);
    const used = usedFonts(pdf);
    assert.ok(used.has('Times-Roman') && used.has('Times-Bold'), `the register is drawn in Times (${[...used].join(', ')})`);
    assert.match(dxf, /\nTables\n/, 'the DXF has a Tables text style');
    assert.match(dxf, /\ntimes\.ttf\n/, 'it names the serif font file');
  });
});
