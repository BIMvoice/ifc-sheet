/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The headless chain on a real model (#163): AC20-FZK-Haus opened in Node,
 * its starting set laid out, the set written as one PDF and a DXF per sheet.
 * The sheet numbers and views pinned here are the ones the web app's own
 * start makes for this model; the viewer test
 * `apps/viewer/src/project/engine-default-set.fzk.test.ts` runs the app's
 * `ensureDrawingSet` beside `generateDefaultSet` and holds the two equal.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import DxfParserModule from 'dxf-parser';
import type { DxfParser as DxfParserInstance } from 'dxf-parser';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { exportDxf, exportPdf, openModel, sheetGraphics, type OpenedModel, type SheetGraphic } from './headless.js';

const FZK = fileURLToPath(new URL('../../../tests/models/ara3d/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`'
  : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch` (or `bash scripts/build-wasm.sh`)' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus headless test: ${missing}`);

/** `dxf-parser`'s CJS build is the class itself; its types say namespace (the same bridge as `drawing-2d`'s `writer-interop.test.ts`). */
const DxfParser = DxfParserModule as unknown as new () => DxfParserInstance;

/** `%PDF` and the page objects of a PDF: jsPDF writes one `/Type /Page` per page. */
const pdfPages = (bytes: Uint8Array): number => (Buffer.from(bytes).toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe.skipIf(missing !== null)('the drawing set of AC20-FZK-Haus, from Node (#163)', () => {
  let model: OpenedModel;
  let set: DefaultSet;
  let sheets: SheetGraphic[];

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
    sheets = await sheetGraphics(set, model);
  }, 300_000);

  it('opens the model: its storeys and the building extent', () => {
    expect(model.storeys.map((s) => s.name).sort()).toEqual(['Dachgeschoss', 'Erdgeschoss']);
    expect(model.extent).not.toBeNull();
  });

  it('lays out the set the Wall makes: plans, elevations in pairs, the two proposed sections', () => {
    const { views, sheets: laid } = set.document;
    expect(laid.map((s) => s.number)).toEqual(['A-101', 'A-201', 'A-202', 'A-301']);
    expect(laid.map((s) => s.name)).toEqual(['Floor plans', 'Elevations, south and north', 'Elevations, east and west', 'Sections']);
    const name = (id: string) => views.find((v) => v.id === id)?.name;
    expect(laid.map((s) => (s.viewports ?? []).map((vp) => name(vp.viewId)))).toEqual([
      ['Erdgeschoss', 'Dachgeschoss'],
      ['South Elevation', 'North Elevation'],
      ['East Elevation', 'West Elevation'],
      ['Section A-A', 'Section B-B'],
    ]);
    // The 3D view is a view of the project but hangs on no sheet of the set.
    expect(views.map((v) => v.kind).sort()).toEqual(['3d', 'elevation', 'elevation', 'elevation', 'elevation', 'plan', 'plan', 'section', 'section']);
    expect(set.document.titleBlock).toEqual({ date: '2026-10-21' });
  });

  it('draws every view on its sheet', () => {
    expect(sheets).toHaveLength(set.document.sheets.length);
    for (const sheet of sheets) expect(sheet.cut.length + sheet.lines.length, sheet.number).toBeGreaterThan(0);
  });

  it('writes the set as one PDF, a page per sheet at its paper size', async () => {
    const pdf = await exportPdf(sheets, { title: set.document.name });
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(pdfPages(pdf)).toBe(sheets.length);
  });

  it('writes each sheet as a DXF a reader parses, its drawings in ENTITIES', () => {
    for (const sheet of sheets) {
      const text = exportDxf(sheet);
      expect(text).toContain('ENTITIES');
      const parsed = new DxfParser().parseSync(text);
      expect(parsed?.entities.length, sheet.number).toBeGreaterThan(sheet.frame.length);
      expect(Object.keys(parsed?.tables.layer.layers ?? {})).toEqual(expect.arrayContaining(['SHEET-FRAME', 'VIEW-CUT', 'VIEW-LINES']));
    }
  });
});
