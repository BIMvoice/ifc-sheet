/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #557, #221: on the committed sample building the default set's plan prints its view title over the label of an elevation mark ("1 / A-201").
 * The title keeps clear of every mark printed on its sheet, measured in sheet mm from the boxes the text prints in.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateDefaultSet } from './index.js';
import { openModel, sheetGraphics, type SheetGraphic } from './headless.js';
import { textPaperBox, titleDrop, type PaperBox } from './title-clear.js';

const SAMPLE = fileURLToPath(new URL('../../../apps/viewer/public/samples/building-architecture.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(SAMPLE) ? 'the sample building-architecture.ifc is not in apps/viewer/public/samples'
  : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the title-clear sample test: ${missing}`);

const overlap = (a: PaperBox, b: PaperBox): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

describe('titleDrop', () => {
  const title = { x0: 10, x1: 50, y0: 100, y1: 104 };
  it('does not move a title nothing is over', () => {
    expect(titleDrop(title, [{ x0: 60, x1: 70, y0: 99, y1: 103 }, { x0: 20, x1: 30, y0: 80, y1: 90 }])).toBe(0);
  });
  it('moves a title under the mark it meets, and under a second mark that the move then meets', () => {
    const drop = titleDrop(title, [{ x0: 20, x1: 30, y0: 99, y1: 103 }, { x0: 40, x1: 45, y0: 103, y1: 109 }]);
    expect(100 + drop).toBeGreaterThanOrEqual(109 + 1);
  });
});

describe.skipIf(missing !== null)('the view titles of the sample building set (#557)', () => {
  let sheets: SheetGraphic[];
  beforeAll(async () => {
    const model = await openModel(new Uint8Array(readFileSync(SAMPLE)));
    const set = generateDefaultSet(model, { now: Date.UTC(2026, 9, 21) });
    if (!set) throw new Error('no set: the model has no extent');
    sheets = await sheetGraphics(set, model);
  }, 300_000);

  it('prints no title over an elevation or section mark', () => {
    let titles = 0;
    let marks = 0;
    for (const sheet of sheets) {
      const labels = sheet.texts.filter((t) => /^\d+ \/ \S+$/.test(t.text));
      marks += labels.length;
      for (const title of sheet.texts.filter((t) => t.layer === 'VIEWPORT-LABELS' && !t.bold && /\s1:\d+$/.test(t.text))) {
        const box = textPaperBox(title);
        titles++;
        for (const label of labels) expect(overlap(box, textPaperBox(label)), `${sheet.number}: "${title.text}" over "${label.text}"`).toBe(false);
      }
    }
    expect(titles).toBeGreaterThan(0);
    expect(marks).toBeGreaterThan(0);
  });
});
