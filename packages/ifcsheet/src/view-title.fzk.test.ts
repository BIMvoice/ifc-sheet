/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #162, #619: the engine's view titles carry the drawing number in its ring, as the app's sheet does. On the default FZK-Haus set each
 * drawing has the number `drawingNumbers` gives it (the one the app prints), the ring starts the title at the left edge of its drawing's
 * box, the PDF and DXF carry both on VIEWPORT-LABELS, and each "n / sheet" mark names a drawing number that is printed on that sheet.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { dxfText } from './__fixtures__/dxf-text.js';
import { drawingNumbers } from './cross-ref/reference.js';
import { generateDefaultSet, type DefaultSet } from './index.js';
import { exportPdf, openModel, sheetGraphics, type SheetGraphic } from './headless.js';
import { numberWidth, viewTitleLayout } from './view-title.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found in apps/viewer/src/test/__fixtures__'
  : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch` (or `bash scripts/build-wasm.sh`)' : null;
if (missing) console.warn(`[ifcsheet] skipping the FZK-Haus view number test: ${missing}`);

/** The bounds of a ring's outline. */
const bounds = (run: readonly { x: number; y: number }[]) => ({
  x0: Math.min(...run.map((p) => p.x)), x1: Math.max(...run.map((p) => p.x)),
  y0: Math.min(...run.map((p) => p.y)), y1: Math.max(...run.map((p) => p.y)),
});

/** The values of the TEXT entities on the VIEWPORT-LABELS layer of a DXF. */
function viewportLabelTexts(dxf: string): string[] {
  const lines = dxf.split(/\r?\n/).map((l) => l.trim());
  const out: string[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] !== '0' || lines[i + 1] !== 'TEXT') continue;
    let layer = '';
    let value = '';
    for (let j = i + 2; j + 1 < lines.length && lines[j] !== '0'; j += 2) {
      if (lines[j] === '8') layer = lines[j + 1];
      if (lines[j] === '1') value = lines[j + 1];
    }
    if (layer === 'VIEWPORT-LABELS') out.push(value);
  }
  return out;
}

describe('the title layout the app and the engine share', () => {
  it('is round for a short number and longer for a long one', () => {
    expect(numberWidth('1', 3.5)).toBe(4.5);
    expect(numberWidth('A-101', 3.5)).toBeGreaterThan(numberWidth('12', 3.5));
  });

  it('starts the ring at the box edge and the text after it', () => {
    const at = viewTitleLayout({ x: 10, y: 20, w: 100, h: 50 }, 3.5, '2');
    expect(at.baseline).toBe(20 + 50 + 3.5 + 1.5);
    expect(at.number?.ring.x).toBe(10);
    expect(at.textX).toBe(10 + 4.5 + 2);
    expect(viewTitleLayout({ x: 10, y: 20, w: 100, h: 50 }, 3.5).textX).toBe(10);
  });
});

describe.skipIf(missing !== null)('the drawing numbers in the FZK-Haus set (#619)', () => {
  let set: DefaultSet;
  let sheets: SheetGraphic[];

  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const made = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) });
    if (!made) throw new Error('no set: the model has no extent');
    set = made;
    sheets = await sheetGraphics(set, model);
  }, 300_000);

  it('rings each drawing\'s number, the one the app prints, at the start of its title', () => {
    const viewIds = new Set(set.document.views.map((v) => v.id));
    let rings = 0;
    for (const sheet of sheets) {
      const source = set.document.sheets.find((s) => s.id === sheet.sheetId)!;
      const numbers = drawingNumbers(source, viewIds);
      const drawn = (source.viewports ?? []).filter((vp) => numbers.has(vp.id));
      const ringed = (sheet.strokes ?? []).filter((s) => s.dxf?.['data-dxf-layer'] === 'VIEWPORT-LABELS');
      expect(ringed, sheet.number).toHaveLength(drawn.length);
      for (const vp of drawn) {
        const box = sheet.viewports.find((v) => v.viewId === vp.viewId)!.box;
        const expected = viewTitleLayout(box, 3.5, numbers.get(vp.id));
        const ring = ringed.map((s) => bounds(s.runs[0])).find((b) => Math.abs(b.x0 - box.x) < 1e-9);
        expect(ring, `${sheet.number} ${vp.id}`).toBeDefined();
        expect(ring!.x1 - ring!.x0).toBeCloseTo(expected.number!.ring.w, 9);
        expect(ring!.y0).toBeCloseTo(expected.number!.ring.y, 9);
        const number = sheet.texts.find((t) => t.layer === 'VIEWPORT-LABELS' && t.bold && Math.abs(t.at.x - expected.number!.at.x) < 1e-9 && Math.abs(t.at.y - expected.number!.at.y) < 1e-9);
        expect(number?.text).toBe(numbers.get(vp.id));
        rings++;
      }
    }
    expect(rings).toBeGreaterThan(0);
  });

  it('writes the numbers in the DXF and puts them in the PDF', async () => {
    const plans = sheets.find((s) => s.number === 'A-101')!;
    const dxf = dxfText(plans);
    expect(viewportLabelTexts(dxf)).toEqual(expect.arrayContaining(['1', '2']));
    const pdf = await exportPdf([plans]);
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('names in each "n / sheet" mark a drawing number that is printed on that sheet', () => {
    const marks = sheets.flatMap((s) => s.texts.map((t) => /^(\S+) \/ (\S+)$/.exec(t.text)).filter((m): m is RegExpExecArray => m !== null));
    expect(marks.length).toBeGreaterThan(0);
    for (const [, drawing, sheet] of marks) {
      const target = sheets.find((s) => s.number === sheet);
      expect(target, `sheet ${sheet}`).toBeDefined();
      const printed = target!.texts.filter((t) => t.layer === 'VIEWPORT-LABELS' && t.bold).map((t) => t.text);
      expect(printed, `${drawing} / ${sheet}`).toContain(drawing);
    }
  });
});
