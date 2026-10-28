/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Room fills (#493), headless: the ground-floor plan of AC20-FZK-Haus with its rooms filled by name, a colour per value and a
 * parquet hatch over one of them, a legend that shows both, written as the sheet's shapes, as PDF and as DXF. The view's switch takes
 * the fills (and the legend) away, and a view template carries the same fills to the views that follow it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { exportDxf, exportPdf, openModel, sheetGraphics, type OpenedModel, type SheetGraphic } from './headless.js';
import type { ColourScheme } from './colour-scheme.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found in apps/viewer/src/test/__fixtures__' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the room fills test: ${missing}`);

const ROOMS = ['Bad', 'Buero', 'Flur', 'Küche', 'Schlafzimmer', 'Wohnen'];
const HATCHED: ColourScheme = { property: 'LongName', target: 'rooms', hatches: { wohnen: 'PARQUET' } };

const pdfContent = (bytes: Uint8Array): string => {
  const raw = Buffer.from(bytes).toString('latin1');
  return [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => {
    try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; }
  }).join('\n');
};
/** The strokes a PDF page paints (`S` operators). */
const strokes = (pdf: string): number => (pdf.match(/^S$/gm) ?? []).length;

describe.skipIf(missing !== null)('the ground-floor plan of AC20-FZK-Haus with rooms filled by name and one hatched, from Node (#493)', () => {
  let model: OpenedModel;
  let base: DefaultSet;
  let planId: string;
  const withScheme = (scheme: ColourScheme | undefined, extra: Partial<DefaultSet['document']> = {}, graphics: object = {}): DefaultSet => ({
    ...base, document: { ...base.document, ...extra, views: base.document.views.map((v) => (v.id === planId ? { ...v, graphics: scheme ? { colourScheme: scheme, ...graphics } : undefined } : v)) },
  });
  const planSheet = (sheets: SheetGraphic[]): SheetGraphic => sheets.find((s) => s.viewports.some((v) => v.viewId === planId))!;
  let plain: SheetGraphic;
  let flat: SheetGraphic;
  let hatched: SheetGraphic;
  let off: SheetGraphic;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    base = generateDefaultSet(model)!;
    planId = base.document.views.find((v) => v.kind === 'plan' && v.name === 'Erdgeschoss')!.id;
    plain = planSheet(await sheetGraphics(withScheme(undefined), model));
    flat = planSheet(await sheetGraphics(withScheme({ property: 'LongName', target: 'rooms' }), model));
    hatched = planSheet(await sheetGraphics(withScheme(HATCHED), model));
    off = planSheet(await sheetGraphics(withScheme({ ...HATCHED, off: true }), model));
  }, 300_000);

  it('gives each room its colour and hatches only the room of the hatched value, in the plan and in the legend', () => {
    expect(hatched.fills.length).toBe(2 * ROOMS.length);
    expect(hatched.fills.map((f) => f.colour)).toEqual(flat.fills.map((f) => f.colour));
    const withHatch = hatched.fills.filter((f) => f.hatch);
    // One room (the Wohnen) and its swatch in the legend.
    expect(withHatch.length).toBe(2);
    expect(withHatch.every((f) => f.hatch!.pattern === 'PARQUET' && f.hatch!.strokes.length > 0)).toBe(true);
    // The room is hatched all over; the legend's swatch is a few millimetres.
    expect(withHatch[0].hatch!.strokes.length).toBeGreaterThan(10);
    expect(withHatch[0].colour).toBe(withHatch[1].colour);
    expect(flat.fills.some((f) => f.hatch)).toBe(false);
    // A stroke lies inside its room: inside the bounds of the room's own fill.
    for (const f of withHatch) {
      const xs = f.loops.flat().map((p) => p.x);
      const ys = f.loops.flat().map((p) => p.y);
      for (const [a, b] of f.hatch!.strokes) {
        for (const p of [a, b]) {
          expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6);
          expect(p.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6);
          expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6);
          expect(p.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6);
        }
      }
    }
    expect(hatched.texts.filter((t) => ROOMS.includes(t.text)).map((t) => t.text)).toEqual(ROOMS);
  });

  it('writes the hatch into the PDF over its colour, one stroke per hatch stroke', async () => {
    const withPdf = pdfContent(await exportPdf([hatched]));
    const withoutPdf = pdfContent(await exportPdf([flat]));
    const count = hatched.fills.reduce((n, f) => n + (f.hatch?.strokes.length ?? 0), 0);
    expect(count).toBeGreaterThan(20);
    expect(strokes(withPdf) - strokes(withoutPdf)).toBe(count);
  });

  it('writes the hatch into the DXF on a layer of its pattern, beside the colour layers', () => {
    const dxf = exportDxf(hatched);
    expect(dxf).toContain('COLOUR-HATCH-PARQUET');
    for (const colour of new Set(hatched.fills.map((f) => f.colour))) expect(dxf).toContain(`COLOUR-${colour.slice(1).toUpperCase()}`);
    expect(exportDxf(flat)).not.toContain('COLOUR-HATCH');
  });

  it('draws nothing of it when the view\'s switch is off: no fills, no legend, the plan as it was', async () => {
    expect(off.fills).toEqual([]);
    expect(off.texts).toEqual(plain.texts);
    expect(off.pens).toEqual(plain.pens);
    expect(pdfContent(await exportPdf([off]))).toBe(pdfContent(await exportPdf([plain])));
    expect(exportDxf(off)).not.toContain('COLOUR-');
  });

  it('prints no fill, no hatch and no legend for rooms the view hides: the Spaces category switched off takes them all away (#516)', async () => {
    const hidden = planSheet(await sheetGraphics(withScheme(HATCHED, {}, { categories: { spaces: { visible: false } } }), model));
    // The shown sheet has the rooms and their legend; with the rooms hidden there is nothing for the scheme to paint or list.
    expect(hatched.fills.length).toBeGreaterThan(0);
    expect(hidden.fills).toEqual([]);
    expect(hidden.texts.filter((t) => ROOMS.includes(t.text))).toEqual([]);
    expect(exportDxf(hidden)).not.toContain('COLOUR-');
  });

  it('is carried by a view template: a view that follows it is filled as if the scheme were its own, and its own scheme wins', async () => {
    const template = { id: 'vt-rooms', name: 'Rooms by name', kind: 'plan' as const, graphics: { colourScheme: HATCHED } };
    const followed = planSheet(await sheetGraphics({
      ...base, document: { ...base.document, viewTemplates: [template], views: base.document.views.map((v) => (v.id === planId ? { ...v, templateId: 'vt-rooms' } : v)) },
    }, model));
    expect(followed.fills).toEqual(hatched.fills);
    const overridden = planSheet(await sheetGraphics({
      ...base, document: { ...base.document, viewTemplates: [template], views: base.document.views.map((v) => (v.id === planId ? { ...v, templateId: 'vt-rooms', graphics: { colourScheme: { property: 'LongName', target: 'rooms' as const } } } : v)) },
    }, model));
    expect(overridden.fills).toEqual(flat.fills);
  });
});
