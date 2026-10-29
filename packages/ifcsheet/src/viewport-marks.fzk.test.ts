/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A viewport's north arrow and scale bar on a real model (AC20-FZK-Haus): the
 * arrow turns to the TrueNorth of the file's 'Model' context, the bar is as
 * long as the viewport's scale makes it, and a sheet that asks for neither is
 * exactly the sheet it was.
 *
 * The file states TrueNorth as the direction (0.766044443119, 0.642787609687),
 * which is cos 40°, sin 40° in the project's XY: north lies 50° clockwise of
 * project +Y, so the arrow stands at -50° (counter-clockwise is positive).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { exportDxf, exportPdf, openModel, sheetGraphics, type OpenedModel, type SheetGraphic } from './headless.js';
import { trueNorthOf } from './true-north.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found in apps/viewer/src/test/__fixtures__'
  : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch` (or `bash scripts/build-wasm.sh`)' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus viewport marks test: ${missing}`);

/** The plans sheet of the set, its viewports asking for the marks at `scale`. */
function withMarks(set: DefaultSet, scale: number, marks: { northArrow?: boolean; scaleBar?: boolean }): DefaultSet {
  const sheets = set.document.sheets.map((s, i) => (i === 0 ? { ...s, viewports: (s.viewports ?? []).map((vp) => ({ ...vp, scale, ...marks })) } : s));
  return { ...set, document: { ...set.document, sheets } };
}

/** Counter-clockwise degrees, from the paper's up, of the arrow's axis (its tip from its notch). */
function arrowDegrees(sheet: SheetGraphic, arrow = 0): number {
  const [tip, notch] = sheet.symbols.strokes.filter((s) => s.length === 2)[arrow];
  return (Math.atan2(-(tip.x - notch.x), -(tip.y - notch.y)) * 180) / Math.PI;
}

describe.skipIf(missing !== null)('north arrows and scale bars on the FZK-Haus plans', () => {
  let model: OpenedModel;
  let set: DefaultSet;

  beforeAll(async () => {
    model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
  }, 300_000);

  it('reads the TrueNorth of the Model context', () => {
    const north = trueNorthOf(model.dataStore);
    expect(north?.x).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 9);
    expect(north?.y).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 9);
  });

  it('turns the arrow of each plan to the model\'s true north: -50 degrees', async () => {
    const [plans] = await sheetGraphics(withMarks(set, 100, { northArrow: true }), model);
    expect(plans.symbols.strokes.filter((s) => s.length === 2)).toHaveLength(2);
    expect(arrowDegrees(plans, 0)).toBeCloseTo(-50, 6);
    expect(arrowDegrees(plans, 1)).toBeCloseTo(-50, 6);
    expect(plans.texts.filter((t) => t.text === 'N')).toHaveLength(2);
  });

  it('draws the scale bar as long as the scale makes it: the plan is 130 mm wide at 1:100, so the bar is 2 x 2.5 m = 50 mm; at 1:200 (65 mm) it is 2 x 2.5 m = 25 mm', async () => {
    for (const [scale, width, labels] of [[100, 130, ['0', '2.5', '5 m']], [200, 65, ['0', '2.5', '5 m']]] as const) {
      const [plans] = await sheetGraphics(withMarks(set, scale, { scaleBar: true }), model);
      const bars = plans.symbols.strokes.filter((s) => s.length === 5 && s[0].y === s[1].y);
      expect(bars).toHaveLength(2);
      for (const [i, bar] of bars.entries()) {
        expect(plans.viewports[i].box.w).toBeCloseTo(width, 0);
        expect(Math.abs(bar[1].x - bar[0].x), `1:${scale}`).toBeCloseTo((5 * 1000) / scale, 9);
      }
      expect(plans.texts.filter((t) => (labels as readonly string[]).includes(t.text) && t.size === 2.5).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('writes the figures in the project\'s format and puts the marks on the SITE-SYMBOLS layer of the DXF and in the PDF', async () => {
    const asked = withMarks(set, 100, { northArrow: true, scaleBar: true });
    const [plain] = await sheetGraphics(asked, model);
    const [comma] = await sheetGraphics(asked, model, { units: { separator: 'comma' } });
    expect(plain.texts.map((t) => t.text)).toContain('2.5');
    expect(comma.texts.map((t) => t.text)).toContain('2,5');
    const dxf = exportDxf(plain);
    expect(dxf).toContain('SITE-SYMBOLS');
    const bare = exportDxf((await sheetGraphics(set, model))[0]);
    expect(bare).not.toContain('SITE-SYMBOLS');
    const pdf = await exportPdf([plain, comma]);
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('leaves a sheet that asks for neither as it was', async () => {
    const [asked] = await sheetGraphics(withMarks(set, 100, {}), model);
    expect(asked.symbols).toEqual({ strokes: [], solids: [] });
    expect(asked.texts.some((t) => t.text === 'N')).toBe(false);
  });
});
