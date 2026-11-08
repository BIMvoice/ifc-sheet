/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557: on the committed sample building's ground plan at 1:100 the elevation mark under the drawing pushes the title down 9 mm. Moved
 * lower on the sheet, the title must still be on the drawing area, and the colour legend (which keeps off every viewport's title strip)
 * must keep off the title where it ended, not off a fixed 12 mm under the box.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { generateDefaultSet, type DefaultSet } from './default-set.js';
import type { ProjectView } from './document.js';
import { generateViewDrawings, openModel } from './headless.js';
import { drawingAreaIn, frameOf } from './sheet-frame.js';
import { sheetGraphic, type SheetGraphic } from './sheet-graphic.js';
import { runsPaperBox, textPaperBox, type PaperBox } from './title-clear.js';

const SAMPLE = fileURLToPath(new URL('../../../apps/viewer/public/samples/building-architecture.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(SAMPLE) ? 'the sample building-architecture.ifc is not in apps/viewer/public/samples'
  : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the title-reserve sample test: ${missing}`);

const overlap = (a: PaperBox, b: PaperBox): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

describe.skipIf(missing !== null)('a title pushed down by a mark (#557)', () => {
  let set: DefaultSet;
  let drawings: Map<string, Drawing2D>;
  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(SAMPLE)));
    set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) })!;
    drawings = await generateViewDrawings(set.document.views, model.buildingMeshes, set.levels, model.extent!);
  }, 300_000);

  /** A-101 with its plan at 1:100, `down` mm lower on the sheet, and a colour legend as wide as the drawing area that fits beside nothing. */
  const sheetWith = (down: number): { g: SheetGraphic; title: PaperBox; legend: PaperBox; areaBottom: number; dropped: number } => {
    const sheet0 = set.document.sheets.find((s) => s.number === 'A-101')!;
    const vp0 = sheet0.viewports![0];
    const sheet = { ...sheet0, viewports: [{ ...vp0, scale: 100, y: vp0.y + down }] };
    const views = set.document.views.map((v): ProjectView => (v.id === vp0.viewId ? { ...v, graphics: { colourScheme: { property: 'LongName', target: 'rooms' } } } : v));
    const doc = { ...set.document, views, sheets: set.document.sheets.map((s) => (s.id === sheet.id ? sheet : s)) };
    const scheme = { fills: [], elementColours: new Map<number, string>(), entries: [{ key: 'k', label: 'x'.repeat(190), colour: '#ff0000', count: 1 }] };
    const g = sheetGraphic(sheet, doc, new Map([[vp0.viewId, drawings.get(vp0.viewId)!]]), undefined, new Map([[vp0.viewId, scheme]]));
    const text = g.texts.find((t) => t.layer === 'VIEWPORT-LABELS' && !t.bold && /\s1:\d+$/.test(t.text))!;
    const box = g.viewports[0].box;
    const area = drawingAreaIn(g.paper, frameOf(sheet));
    return { g, title: textPaperBox(text), legend: runsPaperBox([g.marks[0]])!, areaBottom: area.y + area.h, dropped: text.at.y - (box.y + box.h + 1.5 + 3.5) };
  };

  it('is pushed down by the elevation mark (the case below is a real one)', () => {
    expect(sheetWith(0).dropped).toBeGreaterThan(5);
  });

  it('keeps the legend off the title where the mark pushed it, though that is below the 12 mm strip', () => {
    const { title, legend, dropped } = sheetWith(54);
    expect(dropped).toBeGreaterThan(5);
    expect(overlap(legend, title), `legend ${JSON.stringify(legend)} over the title ${JSON.stringify(title)}`).toBe(false);
  });

  it('keeps the title on the drawing area when the mark would push it past the bottom', () => {
    const { title, areaBottom } = sheetWith(70);
    expect(title.y1).toBeLessThanOrEqual(areaBottom + 1e-9);
  });
});
