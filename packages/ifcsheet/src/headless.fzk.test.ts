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
import { exportDxf, exportPdf, generateViewDrawings, openModel, sheetGraphics, type OpenedModel, type SheetGraphic } from './headless.js';

// The copy committed with the viewer's test fixtures: CI does not run `pnpm fixtures`, so `tests/models/` is empty there.
const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found in apps/viewer/src/test/__fixtures__'
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

  it('names the project after the model, and prints it in each title block', () => {
    expect(set.document.name).toBe('Projekt-FZK-Haus');
    for (const sheet of sheets) expect(sheet.texts.map((t) => t.text)).toEqual(expect.arrayContaining(['Projekt-FZK-Haus', sheet.number]));
  });

  it('keeps every drawing inside the room the layout made for it', () => {
    for (const sheet of sheets) {
      expect(sheet.viewports.length, sheet.number).toBe(2);
      const inside = (p: { x: number; y: number }) => sheet.viewports.some(({ box }) => p.x >= box.x - 1e-6 && p.x <= box.x + box.w + 1e-6 && p.y >= box.y - 1e-6 && p.y <= box.y + box.h + 1e-6);
      for (const pts of [...sheet.cut, ...sheet.lines]) for (const p of pts) expect(inside(p), `${sheet.number} (${p.x}, ${p.y})`).toBe(true);
      // The two boxes of a sheet do not overlap.
      const [a, b] = sheet.viewports.map((v) => v.box);
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, sheet.number).toBe(true);
    }
  });

  it('draws a south elevation with east on the right and a north one with east on the left', async () => {
    const view = (name: string) => set.document.views.find((v) => v.name === name)!;
    const [south, north] = [view('South Elevation'), view('North Elevation')];
    const drawings = await generateViewDrawings([south, north], model.buildingMeshes, set.levels, model.extent!);
    // World x (east) of each element's meshes, against the drawing x of its lines: the same sense in the south elevation, the opposite in the north one.
    const worldX = new Map<number, number>();
    for (const m of model.buildingMeshes) {
      let sum = 0;
      for (let i = 0; i < m.positions.length; i += 3) sum += m.positions[i] + (m.origin?.[0] ?? 0);
      worldX.set(m.expressId, sum / (m.positions.length / 3));
    }
    const sense = (id: string) => {
      const lines = drawings.get(id)!.lines.filter((l) => worldX.has(l.entityId));
      const xs = lines.map((l) => (l.line.start.x + l.line.end.x) / 2);
      const ws = lines.map((l) => worldX.get(l.entityId)!);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const mw = ws.reduce((a, b) => a + b, 0) / ws.length;
      return Math.sign(xs.reduce((acc, x, i) => acc + (x - mx) * (ws[i] - mw), 0));
    };
    expect(sense(south.id)).toBe(1);
    expect(sense(north.id)).toBe(-1);
  }, 120_000);

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
    const all = new Set<string>();
    for (const sheet of sheets) {
      const text = exportDxf(sheet);
      expect(text).toContain('ENTITIES');
      const parsed = new DxfParser().parseSync(text);
      expect(parsed?.entities.length, sheet.number).toBeGreaterThan(sheet.frame.length);
      const layers = Object.keys(parsed?.tables.layer.layers ?? {});
      expect(layers).toContain('SHEET-FRAME');
      expect(layers.some((l) => /^VIEW-(CUT|SEEN|HIDDEN)-\d{3}$/.test(l)), sheet.number).toBe(true);
      for (const l of layers) all.add(l);
    }
    // The drawings by pen, as the app's sheet pens them (#34): the cut pen 0.5 mm, the seen pen 0.25 mm.
    expect([...all]).toEqual(expect.arrayContaining(['VIEW-CUT-050', 'VIEW-SEEN-025']));
  });
});
