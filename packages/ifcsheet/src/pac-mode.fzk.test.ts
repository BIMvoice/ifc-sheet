/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit project mode on AC20-FZK-Haus, through the command line a person runs. The house has two storeys above ±0.00
 * (Erdgeschoss at 0, Dachgeschoss at 2.7) and 120.00 m² of built area on each (the app's `urban-fzk.test.ts`), so Sd is 240 m²:
 * P + M holds, 150 m² does not. `ifcsheet check --project` reports that for a project in the rural mode and says nothing for
 * the full one; `ifcsheet build --pac` takes the mode from the project, or from --pac-mode, which wins.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { PAC_WORDS_RO } from './index.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-pacmode-')); dirs.push(dir); return dir; };
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const project = (extra: Record<string, unknown>) => {
  const path = join(scratch(), 'p.ifclite-project.json');
  writeFileSync(path, JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Haus', ...extra }));
  return path;
};

async function pageTexts(pdf: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdf)), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' '));
    return pages;
  } finally {
    await task.destroy();
  }
}

describe.skipIf(missing !== null)('ifcsheet check --project, for a project in the rural PAC mode (#364)', () => {
  const AREA = 'The model\'s built gross area (Sd) is 240 m²; the simplified PAC (Anexa 3) covers at most 150 m².';

  it('reports the area over 150 m² and not the two levels, as JSON and as text', async () => {
    const json = capture();
    expect(await run(['check', FZK, '--project', project({ pacMode: 'rural' }), '--json'], json.io)).toBe(EXIT.failed);
    const findings = (JSON.parse(json.out()) as { findings: { kind: string; missing: string; params: unknown }[] }).findings.filter((f) => f.kind.startsWith('rural'));
    expect(findings).toEqual([{ kind: 'ruralArea', missing: AREA, effect: expect.stringContaining('outside what the simplified PAC covers'), params: { area: 240, max: 150 } }]);
    const text = capture();
    await run(['check', FZK, '--project', project({ pacMode: 'rural' })], text.io);
    expect(text.out()).toContain(AREA);
  });

  it('says nothing for the full permit project, a project that never chose, or no project', async () => {
    for (const args of [['--project', project({ pacMode: 'full' })], ['--project', project({})], []]) {
      const c = capture();
      await run(['check', FZK, ...args, '--json'], c.io);
      expect((JSON.parse(c.out()) as { findings: { kind: string }[] }).findings.filter((f) => f.kind.startsWith('rural'))).toEqual([]);
    }
  });
});

describe.skipIf(missing !== null)('ifcsheet build --pac, in the rural mode (#364)', () => {
  const pages = async (args: string[]) => {
    const out = join(scratch(), 'pac.pdf');
    const c = capture();
    expect(await run(['build', FZK, '--pac', ...args, '--out', out], c.io)).toBe(EXIT.ok);
    return pageTexts(out);
  };

  it('takes the mode from the project: the sheets of Anexa 3 with no opis; --pac-mode wins over the project', async () => {
    const full = await pages([]);
    expect(full[0]).toContain(PAC_WORDS_RO['pac.opis.title']);
    const rural = await pages(['--project', project({ pacMode: 'rural' })]);
    expect(rural.some((p) => p.includes(PAC_WORDS_RO['pac.opis.title']))).toBe(false);
    // The rural plans are on a larger paper than A3 for this house, and the sheet says so.
    expect(rural.some((p) => /Format A2: desenul nu încape pe A3 la 1:50/.test(p))).toBe(true);
    // The rural template: two plans, four facades, two sections, one sheet each.
    expect(rural).toHaveLength(8);
    expect(await pages(['--pac-mode', 'rural'])).toEqual(rural);
    const override = await pages(['--project', project({ pacMode: 'rural' }), '--pac-mode', 'full']);
    expect(override).toEqual(full);
  }, 120000);
});
