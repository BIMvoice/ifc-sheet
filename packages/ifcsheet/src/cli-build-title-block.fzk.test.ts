/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build` through `run`: the title block's captions follow `--locale` (#601) and `--name` is its Project value
 * (#614). The sheets handed to `exportPdf` are read, since that is what the PDF prints.
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
if (missing) console.warn(`[ifcsheet] skipping the title block test of the CLI: ${missing}`);

const dir = mkdtempSync(join(tmpdir(), 'cli-tb-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function build(...extra: string[]): Promise<string[]> {
  const code = await run(['build', FZK, '--out', join(dir, 'set.pdf'), ...extra], { stdout: () => undefined, stderr: () => undefined });
  expect(code).toBe(EXIT.ok);
  expect(printed.sheets.length).toBeGreaterThan(0);
  return printed.sheets[0].texts.map((t) => t.text);
}

describe.skipIf(missing !== null)('the title block of ifcsheet build', () => {
  it('prints its captions in Romanian under --locale ro (#601)', async () => {
    const texts = await build('--locale', 'ro');
    for (const caption of ['Proiect', 'Adresă', 'Beneficiar', 'Organizație', 'Desenat', 'Verificat', 'Data', 'Revizie', 'Nr. planșă', 'Scara']) expect(texts).toContain(caption);
    for (const english of ['Project', 'Address', 'Client', 'Drawn by', 'Checked by', 'Sheet no.', 'Scale']) expect(texts).not.toContain(english);
  }, 120_000);

  it('keeps the English captions without a locale (#601)', async () => {
    const texts = await build();
    for (const caption of ['Project', 'Address', 'Drawn by', 'Sheet no.', 'Scale']) expect(texts).toContain(caption);
  }, 120_000);

  it('prints --name in the Project field, not the model\'s project name (#614)', async () => {
    const named = await build('--name', 'House Alpha');
    expect(named).toContain('House Alpha');
    expect(named).not.toContain('Projekt-FZK-Haus');
    const unnamed = await build();
    expect(unnamed).toContain('Projekt-FZK-Haus');
  }, 120_000);
});
