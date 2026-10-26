/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The PAC submission PDF (#364) on AC20-FZK-Haus, through the command line a person runs: `ifcsheet build --pac`. One
 * file; page 1 is the opis listing the Anexa 2 items in the order the Code numbers them, each with whether the file holds
 * it; then the sheets in set order, so the page count is 1 + the sheets.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { pacTemplateFor } from './cli-pac.js';
import { PAC_ITEMS, PAC_OPIS_ORDER, PAC_WORDS_EN, PAC_WORDS_RO, generateDefaultSet, pacCoverage, pacOpis, pacOpisTexts } from './index.js';
import { openModel } from './headless.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the PAC submission test: ${missing}`);

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, err: () => err.join('') };
};

/** Anexa 2's own numbering, written out here so the test does not read the order from the code it tests. */
const ANEXA_2_ORDER = [
  ['siteLocation', '1.a, 1.1'], ['situationExisting', '1.b, 1.2'], ['situationProposed', '1.c, 1.3'], ['architectureMemo', '1.4.2'],
  ['plans', '1.4.3 a)'], ['roof', '1.4.3 a)'], ['facades', '1.4.3 a)'], ['sections', '1.4.3 a)'], ['context', '1.4.3 b)'],
  ['diagnosis', '1.4.4 a)'], ['structuralExpertise', '1.4.4 b), c)'], ['survey', '1.4.4 d)'], ['utilities', '1.5'],
  ['specialtyMemos', '1.6.1'], ['neighbourExpertise', '1.6.2'], ['geotechnical', '1.6.3'], ['calculationBrief', '1.6.4'], ['engineeringDrawings', '1.6.5'],
] as const;

interface Item { str: string; x: number; y: number }

/** Each page's text items with their position (pt, y up), in the order the reader finds them. */
async function readPages(bytes: Uint8Array): Promise<Item[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  const pdf = await task.promise;
  try {
    const pages: Item[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.flatMap((i) => ('str' in i && i.str.trim() ? [{ str: i.str, x: i.transform[4], y: i.transform[5] }] : [])));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** The opis rows read off page 1: the point at the left edge, the answer in the right column on the same line. */
function opisRows(items: Item[], answers: readonly string[]): { point: string; included: string }[] {
  const left = Math.min(...items.map((i) => i.x));
  return items.filter((i) => Math.abs(i.x - left) < 1 && /^1\./.test(i.str)).sort((a, b) => b.y - a.y)
    .map((p) => ({ point: p.str, included: items.find((i) => answers.includes(i.str) && Math.abs(i.y - p.y) < 1)?.str ?? '' }));
}

describe('the PAC opis (no model)', () => {
  it('lists every Anexa 2 item once, in Anexa 2 order', () => {
    expect([...PAC_OPIS_ORDER]).toEqual(ANEXA_2_ORDER.map(([id]) => id));
    expect(PAC_ITEMS.map((i) => [i.id, i.point]).sort()).toEqual(ANEXA_2_ORDER.map((r) => [...r]).sort());
    const opis = pacOpis([{ series: 'plans' }, { series: 'sections' }], 'ro', 'Casa');
    expect(opis.rows.map((r) => r.id)).toEqual(ANEXA_2_ORDER.map(([id]) => id));
    expect(opis.rows.filter((r) => r.included).map((r) => r.id)).toEqual(['plans', 'sections']);
    expect(pacOpis([], 'ro', '').rows.some((r) => r.included)).toBe(false);
  });

  it('has the same keys in both languages, with the comma-below letters, and fits one A4 page', () => {
    expect(Object.keys(PAC_WORDS_RO).sort()).toEqual(Object.keys(PAC_WORDS_EN).sort());
    expect(Object.values(PAC_WORDS_RO).join(' ')).not.toMatch(/[şţŞŢ]/);
    const texts = pacOpisTexts(pacOpis(pacCoverage([]).map(() => ({})), 'ro', 'Casa'));
    expect(Math.max(...texts.map((t) => t.at.y))).toBeLessThan(297 - 10);
  });
});

describe.skipIf(missing !== null)('ifcsheet build --pac, on AC20-FZK-Haus (#364)', () => {
  it('writes one PDF: the opis first, then the sheets in set order (pages = 1 + sheets)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-pac-'));
    dirs.push(dir);
    const c = capture();
    const code = await run(['build', FZK, '--pac', '--out', join(dir, 'pac.pdf')], c.io);
    expect(c.err()).toBe('');
    expect(code).toBe(EXIT.ok);
    expect(readdirSync(dir)).toEqual(['pac.pdf']);

    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const set = generateDefaultSet(model, { setTemplate: pacTemplateFor('ro') })!;
    const pages = await readPages(new Uint8Array(readFileSync(join(dir, 'pac.pdf'))));
    expect(set.document.sheets.length).toBeGreaterThanOrEqual(3);
    expect(pages.length).toBe(1 + set.document.sheets.length);

    // Page 1: the opis, the items in Anexa 2 order, the set's drawn ones answered Da.
    const answers = [PAC_WORDS_RO['pac.opis.yes'], PAC_WORDS_RO['pac.opis.no']];
    expect(pages[0].map((i) => i.str).join(' ')).toContain(PAC_WORDS_RO['pac.opis.title']);
    const drawn = new Set(pacCoverage(set.document.sheets).filter((r) => r.drawn).map((r) => r.item.id));
    expect(drawn.size).toBeGreaterThan(0);
    const rows = opisRows(pages[0], answers);
    const expected = ANEXA_2_ORDER.map(([id, point]) => ({ point, included: answers[drawn.has(id) ? 0 : 1] }));
    expect(rows).toEqual(expected);

    // The sheets follow in the set's order: each page after the opis carries its sheet's number.
    for (const [i, sheet] of set.document.sheets.entries()) expect(pages[i + 1].map((t) => t.str).join(' '), sheet.name).toContain(sheet.number);
  });

  it('writes the English opis with --locale en', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-pac-'));
    dirs.push(dir);
    const c = capture();
    expect(await run(['build', FZK, '--pac', '--locale', 'en', '--out', join(dir, 'pac.pdf')], c.io)).toBe(EXIT.ok);
    const [first] = await readPages(new Uint8Array(readFileSync(join(dir, 'pac.pdf'))));
    expect(first.map((i) => i.str).join(' ')).toContain(PAC_WORDS_EN['pac.opis.title']);
  });

  it('refuses --pac with --template, and --pac on another command', async () => {
    const a = capture();
    expect(await run(['build', FZK, '--pac', '--template', 'x.bvset', '--out', 'x.pdf'], a.io)).toBe(EXIT.usage);
    const b = capture();
    expect(await run(['check', FZK, '--pac'], b.io)).toBe(EXIT.usage);
  });
});
