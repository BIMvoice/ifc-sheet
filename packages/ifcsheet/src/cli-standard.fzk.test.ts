/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet build --standard ro` (#365): the Romanian and German packs' pens and title block, on AC20-FZK-Haus. */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const dirs: string[] = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-standard-')); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

/** The texts of every page of a PDF, as the PDF prints them. */
async function pdfTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const pdf = await task.promise;
  try {
    const out: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      out.push(...content.items.map((item) => ('str' in item ? item.str : '')));
    }
    return out;
  } finally {
    await task.destroy();
  }
}

/** The DXF layers of the drawing pens of a sheet's file: `VIEW-CUT-070` is the cut line at 0.7 mm. */
const penLayers = (dxf: string): string[] => [...new Set(dxf.match(/VIEW-[A-Z]+-\d+/g))].sort();

async function build(...extra: string[]): Promise<{ code: number; err: string; texts: string[]; layers: string[] }> {
  const dir = scratch();
  const c = capture();
  const code = await run(['build', FZK, '--out', join(dir, 'set.pdf'), '--dxf', join(dir, 'dxf'), ...extra], c.io);
  const layers = existsSync(join(dir, 'dxf')) ? [...new Set(readdirSync(join(dir, 'dxf')).flatMap((f) => penLayers(readFileSync(join(dir, 'dxf', f), 'utf8'))))].sort() : [];
  return { code, err: c.err(), texts: existsSync(join(dir, 'set.pdf')) ? await pdfTexts(new Uint8Array(readFileSync(join(dir, 'set.pdf')))) : [], layers };
}

describe.skipIf(missing !== null)('ifcsheet build --standard, on AC20-FZK-Haus', () => {
  it('ro: the Romanian title block captions are printed and the cut line is drawn at 0.7', async () => {
    const ro = await build('--standard', 'ro');
    expect(ro.err).toBe('');
    expect(ro.code).toBe(EXIT.ok);
    for (const caption of ['Proiectant general', 'Șef proiect', 'Proiectat', 'Faza', 'Proiect nr.', 'Titlu proiect', 'Semnătura', 'Verificator / expert', 'Cerința', 'Planșa nr.']) {
      expect(ro.texts, caption).toContain(caption);
    }
    expect(ro.layers).toContain('VIEW-CUT-070');
    expect(ro.layers).not.toContain('VIEW-CUT-050');
  }, 120_000);

  it('de: the German title block captions are printed, and the Romanian ones are not', async () => {
    const de = await build('--standard', 'de');
    expect(de.err).toBe('');
    expect(de.code).toBe(EXIT.ok);
    for (const caption of ['Bauvorhaben', 'Bauherr', 'Entwurfsverfasser', 'Planinhalt', 'Maßstab']) expect(de.texts, caption).toContain(caption);
    expect(de.texts).not.toContain('Proiectant general');
    expect(de.layers).toContain('VIEW-CUT-050');
    expect(de.layers).not.toContain('VIEW-CUT-070');
  }, 120_000);

  it('without --standard the build is what it was: the standard title block and the cut line at 0.5', async () => {
    const plain = await build();
    expect(plain.code).toBe(EXIT.ok);
    expect(plain.texts).not.toContain('Proiectant general');
    expect(plain.layers).toContain('VIEW-CUT-050');
    expect(plain.layers).not.toContain('VIEW-CUT-070');
  }, 120_000);

  it('an unknown id fails with a usage error that names it and lists the known ids, and writes nothing', async () => {
    const dir = scratch();
    const c = capture();
    const code = await run(['build', FZK, '--out', join(dir, 'set.pdf'), '--standard', 'din'], c.io);
    expect(code).toBe(EXIT.usage);
    expect(c.err()).toContain('unknown standard "din"');
    expect(c.err()).toContain('Known standards: ro, de');
    expect(existsSync(join(dir, 'set.pdf'))).toBe(false);
  });

  it('is an option of build only', async () => {
    const c = capture();
    expect(await run(['check', FZK, '--standard', 'ro'], c.io)).toBe(EXIT.usage);
    expect(c.err()).toContain('--standard');
  });
});
