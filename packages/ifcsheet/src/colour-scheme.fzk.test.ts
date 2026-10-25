/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan coloured by a property, headless (#92): AC20-FZK-Haus opened in Node, its ground-floor plan coloured by the LongName of its
 * rooms (the model has no property called function; the rooms' LongName is it: Schlafzimmer, Bad, Buero, Wohnen, Flur, Küche), laid
 * out on its sheet, written as PDF and DXF. The viewer test `project/view-colour-scheme.fzk.test.tsx` holds the app to the same colours.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { exportDxf, exportPdf, openModel, sheetGraphics, type OpenedModel, type SheetGraphic } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found in apps/viewer/src/test/__fixtures__' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the coloured plan test: ${missing}`);

const ROOMS = ['Bad', 'Buero', 'Flur', 'Küche', 'Schlafzimmer', 'Wohnen'];

/** The decoded content of every Flate stream of a PDF. */
const pdfContent = (bytes: Uint8Array): string => {
  const raw = Buffer.from(bytes).toString('latin1');
  return [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => {
    try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; }
  }).join('\n');
};

describe.skipIf(missing !== null)('the ground-floor plan of AC20-FZK-Haus coloured by room function, from Node (#92)', () => {
  let model: OpenedModel;
  let plain: DefaultSet;
  let coloured: DefaultSet;
  let plainSheets: SheetGraphic[];
  let sheets: SheetGraphic[];
  let sheet: SheetGraphic;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    plain = generateDefaultSet(model)!;
    const plan = plain.document.views.find((v) => v.kind === 'plan' && v.name === 'Erdgeschoss')!;
    coloured = { ...plain, document: { ...plain.document, views: plain.document.views.map((v) => (v.id === plan.id ? { ...v, graphics: { colourScheme: { property: 'LongName', target: 'rooms' as const, colours: { galerie: '#123456' } } } } : v)) } };
    plainSheets = await sheetGraphics(plain, model);
    sheets = await sheetGraphics(coloured, model);
    sheet = sheets.find((s) => s.viewports.some((v) => v.viewId === plan.id))!;
  }, 300_000);

  it('fills each room, one colour per function, and lists those functions and no others in a legend', () => {
    const fills = sheet.fills;
    expect(fills.length).toBe(2 * ROOMS.length);
    const rooms = fills.slice(0, ROOMS.length);
    const swatches = fills.slice(ROOMS.length);
    expect(new Set(rooms.map((f) => f.colour)).size).toBe(ROOMS.length);
    expect(swatches.map((f) => f.colour).sort()).toEqual(rooms.map((f) => f.colour).sort());
    const labels = sheet.texts.filter((t) => ROOMS.includes(t.text)).map((t) => t.text);
    expect(labels).toEqual(ROOMS);
    expect(sheet.texts.some((t) => t.text === 'LongName')).toBe(true);
    // The upstairs room is on another sheet's plan: it is not in this plan's legend.
    expect(sheet.texts.some((t) => t.text === 'Galerie')).toBe(false);
    expect(sheet.fills.some((f) => f.colour === '#123456')).toBe(false);
  });

  it('puts the legend inside the frame, clear of the plans and their titles', () => {
    const legendLines = sheet.cut.filter((p) => p.length === 5).slice(-(ROOMS.length + 1));
    const frame = sheet.frame[0];
    const [x0, x1] = [Math.min(...frame.map((p) => p.x)), Math.max(...frame.map((p) => p.x))];
    const [y0, y1] = [Math.min(...frame.map((p) => p.y)), Math.max(...frame.map((p) => p.y))];
    const outer = legendLines.reduce((a, b) => ((Math.max(...b.map((p) => p.x)) - Math.min(...b.map((p) => p.x))) > (Math.max(...a.map((p) => p.x)) - Math.min(...a.map((p) => p.x))) ? b : a));
    const box = { x0: Math.min(...outer.map((p) => p.x)), x1: Math.max(...outer.map((p) => p.x)), y0: Math.min(...outer.map((p) => p.y)), y1: Math.max(...outer.map((p) => p.y)) };
    expect(box.x0).toBeGreaterThanOrEqual(x0);
    expect(box.x1).toBeLessThanOrEqual(x1);
    expect(box.y0).toBeGreaterThanOrEqual(y0);
    expect(box.y1).toBeLessThanOrEqual(y1);
    for (const { box: v } of sheet.viewports) {
      const apart = box.x1 <= v.x || box.x0 >= v.x + v.w || box.y1 <= v.y || box.y0 >= v.y + v.h + 12;
      expect(apart, `legend ${JSON.stringify(box)} against viewport ${JSON.stringify(v)}`).toBe(true);
    }
  });

  it('writes the fills into the PDF, under the lines, and into the DXF as a layer per colour', async () => {
    const pdf = pdfContent(await exportPdf(sheets));
    expect((pdf.match(/\bf\*/g) ?? []).length).toBeGreaterThanOrEqual(2 * ROOMS.length);
    // Each region sets its colour (`r g b rg`; PDF writes 1 as `1.`, and jsPDF keeps two decimals, so a channel is within 2 of 255).
    const set = [
      ...[...pdf.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) rg$/gm)].map((m) => [1, 2, 3].map((i) => Number(m[i]) * 255)),
      ...[...pdf.matchAll(/^([\d.]+) g$/gm)].map((m) => [Number(m[1]) * 255, Number(m[1]) * 255, Number(m[1]) * 255]), // a grey is written as one number
    ];
    for (const f of new Set(sheet.fills.map((x) => x.colour))) {
      const want = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16));
      expect(set.some((got) => got.every((c, i) => Math.abs(c - want[i]) <= 2)), f).toBe(true);
    }
    // The fills come before the first stroke of the page: the lines are drawn over them.
    expect(pdf.indexOf('\nf*\n')).toBeLessThan(pdf.search(/\nS\n/));
    const dxf = exportDxf(sheet);
    for (const colour of new Set(sheet.fills.map((f) => f.colour))) expect(dxf).toContain(`COLOUR-${colour.slice(1).toUpperCase()}`);
  });

  it('leaves a set that is not coloured as it was', async () => {
    expect(plainSheets.every((s) => s.fills.length === 0)).toBe(true);
    const other = sheets.find((s) => s !== sheet)!;
    const same = plainSheets.find((s) => s.sheetId === other.sheetId)!;
    expect(other.fills).toEqual([]);
    expect(other.cut).toEqual(same.cut);
    expect(other.texts).toEqual(same.texts);
    expect(exportDxf(plainSheets[0])).not.toContain('COLOUR-');
  });
});
