/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build --pac` draws the north arrow and the scale bar the PAC set template asks for (#425): the PDF page of the
 * plans sheet carries the arrow's "N" and a bar label. Run through the command, so the template, the set and the drawing agree.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the permit set marks build test: ${missing}`);

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

/** The text items of every page of `ifcsheet build <model> ...args`. */
async function pages(args: string[]): Promise<string[][]> {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-permit-marks-'));
  dirs.push(dir);
  const code = await run(['build', FZK, ...args, '--out', join(dir, 'a.pdf')], { stdout: () => undefined, stderr: () => undefined });
  expect(code).toBe(EXIT.ok);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(dir, 'a.pdf'))), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const doc = await task.promise;
  try {
    const out: string[][] = [];
    for (let n = 1; n <= doc.numPages; n++) out.push((await (await doc.getPage(n)).getTextContent()).items.flatMap((i) => ('str' in i ? [i.str.trim()] : [])));
    return out;
  } finally {
    await task.destroy();
  }
}

describe.skipIf(missing !== null)('ifcsheet build --pac draws the marks of the PAC set template, on AC20-FZK-Haus (#425)', { timeout: 120_000 }, () => {
  it('prints the north arrow\'s N and the scale bar\'s labels on the pages of the plans', async () => {
    const all = await pages(['--pac']);
    const text = all.flat();
    expect(text).toContain('N');
    expect(text).toContain('5 m');
  });
});
