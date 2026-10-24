/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #292: a label of one character (the "A" of a section mark) carries `textLength`, and svg2pdf.js spreads the
 * difference over `length - 1` gaps, which for one character is zero: the issued page got `-Infinity Tc`, an
 * operator Poppler cannot read, and lost the rest of the page. The sheets are drawn by the real sheet paper
 * (`captureSheets`) and written by the real builder, and the content streams are read as the file holds them.
 */
import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as jspdf from 'jspdf';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { captureSheets } from './capture.js';
import { buildIssuePdf } from './pdf-build.js';
import { pdfLabels, planFor } from './run.js';

const loadFont = async (url: string) => new Uint8Array(readFileSync(new URL(`../../public${url}`, import.meta.url)));

/** One plan on one sheet, with drafted text: a one-character label and a longer one. */
function sheetWithLabels(texts: string[]): ProjectSheet {
  const view = addProjectView({ kind: 'plan', name: 'Ground floor plan', level: { name: 'L0', elevation: 0 }, cutHeight: 1.2, scale: 100 } as never);
  useViewDrawings.setState({ byView: { [view]: { ...EMPTY_VIEW_DRAWING, drawing: null, status: 'ready' } } });
  useProjectStore.setState({
    draftLayers: [{ id: 'L1', name: 'Notes', color: '#000000', visible: true, locked: false, lineWeight: 0.35 }],
    drafts: texts.map((text, i) => ({ id: `t${i}`, viewId: view, layerId: 'L1', shape: { type: 'text', p: { x: i, y: 0 }, text, height: 0.25, rotation: 0 }, params: { textStyle: 'standard' } })),
  });
  const sheet = { id: 's1', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [{ id: 'p1', viewId: view, x: 150, y: 100, scale: 100, width: 150, height: 60, center: null }] };
  return sheet as unknown as ProjectSheet;
}

/** Every content stream of the file, inflated, as text. Node's own latin1 keeps every byte (TextDecoder's 'latin1' is windows-1252 and does not). */
function contentStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { out.push(inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); } catch { /* an image or a font: not a content stream */ }
  }
  return out;
}

async function issued(texts: string[]): Promise<{ bytes: Uint8Array; svgs: string[] }> {
  useProjectStore.setState({ sheets: [sheetWithLabels(texts)] });
  const plan = planFor({ name: 'P01', date: '2026-10-24', listFirst: false });
  const drawn = await captureSheets(plan.sheets.map((s) => s.sheet));
  assert.deepEqual(drawn.failed, []);
  const window = globalThis.window as unknown as { jspdf?: typeof jspdf };
  const prior = window.jspdf;
  window.jspdf = jspdf;
  try {
    const bytes = await buildIssuePdf(plan, drawn.svgs, 'House', pdfLabels(), { loadFont, created: new Date(2026, 9, 24, 12, 0, 0) });
    return { bytes, svgs: [...drawn.svgs.values()] };
  } finally {
    window.jspdf = prior;
  }
}

beforeEach(() => {
  resetProject();
  useViewDrawings.setState({ byView: {} });
});

/** The `<text>` elements of the sheets whose text is `text`, as their opening tags. */
const textTags = (svgs: string[], text: string): string[] => svgs.flatMap((svg) => [...svg.matchAll(new RegExp(`<text\\b[^>]*>${text}</text>`, 'g'))].map((m) => m[0]));

describe('the issued PDF and one-character labels (#292)', () => {
  it('writes no Infinity or NaN into any content stream when a label is a single character', async () => {
    const { bytes } = await issued(['A', 'B', 'Section']);
    const streams = contentStreams(bytes);
    assert.ok(streams.some((s) => s.includes(' Tf')), `the page carries text (${streams.length} streams read)`);
    for (const s of streams) assert.doesNotMatch(s, /Infinity|NaN/, 'a number the PDF cannot hold');
  });

  it('gives a label of two or more characters the width it was measured for, and a single character none', async () => {
    const { svgs } = await issued(['A', 'A1', 'Section']);
    const one = textTags(svgs, 'A');
    assert.ok(one.length > 0, 'the one-character label is on the sheet');
    for (const tag of one) assert.doesNotMatch(tag, /textLength/, tag);
    for (const word of ['A1', 'Section']) {
      const tags = textTags(svgs, word);
      assert.ok(tags.length > 0, `${word} is on the sheet`);
      for (const tag of tags) assert.match(tag, /textLength="[\d.]+"/, tag);
    }
  });
});
