/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build --annotate` through `run` on AC20-FZK-Haus (#707, step 7): the dimension strings, tags and level marks that
 * "Annotate the set" drafts are on the sheets the PDF and the DXFs print; a bad `--annotate` is a usage error, and it is an option
 * of build only. The sheets handed to `exportPdf` are read, since that is what the PDF prints.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found: run `pnpm fixtures`' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the --annotate test of the CLI: ${missing}`);

const dir = mkdtempSync(join(tmpdir(), 'cli-annotate-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

interface Built { texts: string[]; dxfTexts: number; stderr: string }
let n = 0;
/** `ifcsheet build` with `extra`: the texts of every sheet, how many TEXT and MTEXT entities the DXFs hold, and what was said on stderr. */
async function build(...extra: string[]): Promise<Built> {
  const dxf = join(dir, `dxf-${++n}`);
  const err: string[] = [];
  const code = await run(['build', FZK, '--out', join(dir, `set-${n}.pdf`), '--dxf', dxf, ...extra], { stdout: () => undefined, stderr: (t) => void err.push(t) });
  expect(code, err.join('')).toBe(EXIT.ok);
  const dxfTexts = readdirSync(dxf).reduce((sum, f) => sum + (readFileSync(join(dxf, f), 'utf8').match(/^\s*M?TEXT\s*$/gm) ?? []).length, 0);
  return { texts: printed.sheets.flatMap((s) => s.texts.map((t) => t.text)), dxfTexts, stderr: err.join('') };
}
const figures = (texts: readonly string[]) => texts.filter((t) => /^\d+([.,]\d+)?$/.test(t.trim()));

describe.skipIf(missing !== null)('ifcsheet build --annotate on AC20-FZK-Haus (#707)', () => {
  it('puts the dimension figures in the sheets and the DXFs, and says what it did per view', async () => {
    const plain = await build();
    const dimensioned = await build('--annotate=dimension');
    expect(figures(dimensioned.texts).length).toBeGreaterThan(figures(plain.texts).length + 5);
    expect(dimensioned.dxfTexts).toBeGreaterThan(plain.dxfTexts + 5);
    expect(dimensioned.stderr).toMatch(/annotated .*: dimall \+\d+/);
    expect(plain.stderr).not.toMatch(/annotated/);
  }, 300_000);

  it('a bare --annotate is every command: tags and level marks come with the dimensions', async () => {
    const dimensioned = await build('--annotate=dimension');
    const all = await build('--annotate');
    expect(all.texts.length).toBeGreaterThan(dimensioned.texts.length);
    expect(all.stderr).toMatch(/tagall \+\d+/);
    expect(all.stderr).toMatch(/levelall \+\d+/);
  }, 300_000);

  it('refuses a --annotate it cannot read, and on any command but build', async () => {
    const err: string[] = [];
    expect(await run(['build', FZK, '--out', join(dir, 'x.pdf'), '--annotate=frobnicate'], { stdout: () => undefined, stderr: (t) => void err.push(t) })).toBe(EXIT.usage);
    expect(err.join('')).toMatch(/--annotate: "frobnicate" is not all, a list of dimension, tag, level, or a preset of the project \(it has none\)/);
    const other: string[] = [];
    expect(await run(['rooms', FZK, '--annotate'], { stdout: () => undefined, stderr: (t) => void other.push(t) })).toBe(EXIT.usage);
    expect(other.join('')).toMatch(/rooms has no --annotate; it is an option of build/);
  }, 60_000);
});
