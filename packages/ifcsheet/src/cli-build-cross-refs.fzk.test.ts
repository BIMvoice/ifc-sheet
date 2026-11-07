/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #619: `ifcsheet build` draws the elevation marks round the ground plan ("1 / A-201", the drawing's number on its sheet and the
 * sheet's number), as the app's sheet does. The sheets handed to `exportPdf` are read, since that is what the PDF prints.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { EXIT, run } from './cli.js';
import type { SheetGraphic } from './headless.js';

const printed = vi.hoisted(() => ({ sheets: [] as SheetGraphic[] }));
vi.mock('./headless.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./headless.js')>();
  return { ...real, exportPdf: (sheets: SheetGraphic[], options?: Parameters<typeof real.exportPdf>[1]) => { printed.sheets = sheets; return real.exportPdf(sheets, options); } };
});

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the cross-reference test of the CLI: ${missing}`);

const dir = mkdtempSync(join(tmpdir(), 'cli-xref-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(missing !== null)('the cross-reference marks of ifcsheet build (#619)', () => {
  it('prints an elevation mark on each side of the ground plan, naming the sheet its elevation is on', async () => {
    const code = await run(['build', FZK, '--out', join(dir, 'set.pdf')], { stdout: () => undefined, stderr: () => undefined });
    expect(code).toBe(EXIT.ok);
    const ground = printed.sheets.find((s) => s.number === 'A-101');
    expect(ground, 'the ground plan sheet A-101').toBeDefined();
    const marks = ground!.texts.map((t) => t.text).filter((t) => /^\d+ \/ A-\d+$/.test(t)).sort();
    expect(marks).toEqual(['1 / A-201', '1 / A-202', '2 / A-201', '2 / A-202']);
    // Each is on the sheet that holds its elevation: the numbers the marks name are the sheets of the set.
    const numbers = new Set(printed.sheets.map((s) => s.number));
    for (const mark of marks) expect(numbers.has(mark.split(' / ')[1]!), mark).toBe(true);
  }, 180_000);
});
