/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet build --pac` draws the Romanian cartuș F_01 (#426): a permit project is a Romanian one (Ordinul 975/2026), so
 * the title block labels, the date and the template notice are Romanian without `--standard ro`; an explicit `--standard`
 * wins; English is as it was.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const BLOC = fileURLToPath(new URL('../../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the PAC title block test: ${missing}`);

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

/** The text of page 2 (the first sheet) and what the command printed. */
async function build(args: string[], model = FZK): Promise<{ page: string; out: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-pac-tb-'));
  dirs.push(dir);
  const out: string[] = [];
  const code = await run(['build', model, ...args, '--out', join(dir, 'a.pdf')], { stdout: (t: string) => void out.push(t), stderr: () => undefined });
  expect(code).toBe(EXIT.ok);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(dir, 'a.pdf'))), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  try {
    const content = await (await (await task.promise).getPage(2)).getTextContent();
    return { page: content.items.flatMap((i) => ('str' in i ? [i.str] : [])).join(' '), out: out.join('') };
  } finally {
    await task.destroy();
  }
}

const RO_LABELS = ['Proiect', 'Adresă', 'Beneficiar', 'Titlu planșă', 'Scara', 'Revizie'];
const EN_LABELS = ['Project', 'Address', 'Client', 'Sheet no.', 'Drawn by', 'Checked by'];
const ROMANIAN_DATE = /\b\d{2}\.\d{2}\.\d{4}\b/;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

describe.skipIf(missing !== null)('ifcsheet build --pac title block, on AC20-FZK-Haus (#426)', () => {
  it('--pac --locale ro prints the Romanian F_01 labels and a dd.mm.yyyy date, with no --standard', async () => {
    const { page } = await build(['--pac', '--locale', 'ro']);
    for (const label of RO_LABELS) expect(page, label).toContain(label);
    for (const label of EN_LABELS) expect(page, label).not.toContain(label);
    expect(page).toMatch(ROMANIAN_DATE);
    expect(page).not.toMatch(ISO_DATE);
  });

  it('--pac alone is the same as --pac --locale ro (the permit is Romanian)', async () => {
    const { page } = await build(['--pac']);
    expect(page).toContain('Beneficiar');
    expect(page).toMatch(ROMANIAN_DATE);
  });

  it('prints the template notice in the language of the permit: Romanian by default, English with --locale en', async () => {
    const ro = (await build(['--pac', '--pac-mode', 'rural', '--locale', 'ro'], BLOC)).out;
    expect(ro).toContain('Nu sunt în șablon; au fost așezate ca în setul automat');
    expect(ro).not.toContain('Not in the template');
    const en = (await build(['--pac', '--pac-mode', 'rural', '--locale', 'en'], BLOC)).out;
    expect(en).toContain('Not in the template, laid out the way the automatic set does');
  }, 120000);

  it('keeps an explicit --standard: ro is the same block, and any other id is the one used (here refused as unknown), never replaced by the default', async () => {
    const { page } = await build(['--pac', '--locale', 'ro', '--standard', 'ro']);
    expect(page).toContain('Beneficiar');
    const err: string[] = [];
    expect(await run(['build', FZK, '--pac', '--standard', 'xx', '--out', join(tmpdir(), 'ifcsheet-pac-tb-unused.pdf')], { stdout: () => undefined, stderr: (t: string) => void err.push(t) })).not.toBe(EXIT.ok);
    expect(err.join('')).toContain('unknown standard "xx"');
  });

  it('--pac --locale en is unchanged: the English labels and the ISO date', async () => {
    const { page } = await build(['--pac', '--locale', 'en']);
    for (const label of EN_LABELS) expect(page, label).toContain(label);
    expect(page).toMatch(ISO_DATE);
    expect(page).not.toMatch(ROMANIAN_DATE);
  });
});
