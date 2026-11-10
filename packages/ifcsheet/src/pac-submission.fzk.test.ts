/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The PAC submission PDF (#364) on AC20-FZK-Haus, through the command line a person runs: `ifcsheet build --pac`. One
 * file; page 1 is the opis listing the Anexa 2 items in the order the Code numbers them, each with whether the file holds
 * it; then the sheets in set order, so the page count is 1 + the sheets.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { pacTemplateFor } from './cli-pac.js';
import { PAC_WORDS_EN, PAC_WORDS_RO, generateDefaultSet, pacOpis, pacOpisTexts } from './index.js';
import { openModel } from './headless.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
// The FZK model is committed (apps/viewer/src/test/__fixtures__): its absence is a broken checkout and fails below, it is not skipped.
// The wasm bundle is a build artefact: its absence skips, saying how to get it, as the other model tests do.
const missing = !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the PAC submission test: ${missing}`);

it('has the committed AC20-FZK-Haus fixture', () => {
  expect(existsSync(FZK), `${FZK} is committed; a missing file is a broken checkout`).toBe(true);
});

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, err: () => err.join('') };
};

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

describe('the PAC opis words and page (no model)', () => {
  it('has the same keys in both languages, with the comma-below letters, and fits one A4 page', () => {
    expect(Object.keys(PAC_WORDS_RO).sort()).toEqual(Object.keys(PAC_WORDS_EN).sort());
    expect(Object.values(PAC_WORDS_RO).join(' ')).not.toMatch(/[şţŞŢ]/);
    expect(PAC_WORDS_RO['pac.opis.na']).toBe('Nu este cazul');
    expect(PAC_WORDS_EN['pac.opis.na']).toBe('Not applicable');
    const texts = pacOpisTexts(pacOpis([], 'ro', 'Casa', { views: [] }));
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

    // Page 1: the opis, the items in Anexa 2 order. The answers are the ones Anexa 2 gives for a new building drawn from
    // this model, written out by hand (not computed): plans, facades and sections are drawn; point 1.4.4 is for works on an
    // existing building; everything else is for the person to supply.
    const answers = [PAC_WORDS_RO['pac.opis.yes'], PAC_WORDS_RO['pac.opis.no'], PAC_WORDS_RO['pac.opis.na']];
    expect(pages[0].map((i) => i.str).join(' ')).toContain(PAC_WORDS_RO['pac.opis.title']);
    expect(opisRows(pages[0], answers)).toEqual([
      { point: '1.a, 1.1', included: 'Nu' }, { point: '1.b, 1.2', included: 'Nu' }, { point: '1.c, 1.3', included: 'Nu' }, { point: '1.4.2', included: 'Nu' },
      { point: '1.4.3 a)', included: 'Da' }, { point: '1.4.3 a)', included: 'Nu' }, { point: '1.4.3 a)', included: 'Da' }, { point: '1.4.3 a)', included: 'Da' },
      { point: '1.4.3 b)', included: 'Nu' }, { point: '1.4.4 a)', included: 'Nu este cazul' }, { point: '1.4.4 b), c)', included: 'Nu este cazul' },
      { point: '1.4.4 d)', included: 'Nu este cazul' }, { point: '1.5', included: 'Nu' }, { point: '1.6.1', included: 'Nu' }, { point: '1.6.2', included: 'Nu' },
      { point: '1.6.3', included: 'Nu' }, { point: '1.6.4', included: 'Nu' }, { point: '1.6.5', included: 'Nu' },
    ]);

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

  it('one language for the run: the project\'s, else --locale, else Romanian; --locale xx is a usage error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-pac-'));
    dirs.push(dir);
    const projectFile = (language: string) => {
      const file = join(dir, `${language}.json`);
      writeFileSync(file, JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', language }));
      return file;
    };
    const opisTitle = async (args: string[]) => {
      const c = capture();
      const pdf = join(dir, `${args.join('_').replace(/[^\w]/g, '')}.pdf`);
      expect(await run(['build', FZK, '--pac', '--out', pdf, ...args], c.io)).toBe(EXIT.ok);
      const [first] = await readPages(new Uint8Array(readFileSync(pdf)));
      return { title: first.map((i) => i.str).join(' '), said: c.err().split('\n').filter((l) => !l.includes('holds no drawing set')).join('\n') };
    };
    // A project that records en: the opis is English without --locale; the project wins over --locale ro, and says so.
    const en = await opisTitle(['--project', projectFile('en')]);
    expect(en.title).toContain(PAC_WORDS_EN['pac.opis.title']);
    expect(en.said).toBe('');
    const mismatch = await opisTitle(['--project', projectFile('en'), '--locale', 'ro']);
    expect(mismatch.title).toContain(PAC_WORDS_EN['pac.opis.title']);
    expect(mismatch.said).toBe("ifcsheet: --locale ro differs from the project's language en; using en.\n");
    // A project that records ro and no --locale: Romanian.
    expect((await opisTitle(['--project', projectFile('ro')])).title).toContain(PAC_WORDS_RO['pac.opis.title']);
    // The PAC set template is named in that language too (the sheets, not only the opis): the handover's DXF files carry the sheet names.
    const zip = join(dir, 'en.zip');
    expect(await run(['build', FZK, '--pac', '--handover', zip, '--project', projectFile('en')], capture().io)).toBe(EXIT.ok);
    const files = Object.keys(unzipSync(new Uint8Array(readFileSync(zip)))).filter((n) => n.endsWith('.dxf')).join('\n');
    expect(files).toContain(PAC_WORDS_EN['pac.set.plans']);
    expect(files).not.toContain(PAC_WORDS_RO['pac.set.plans']);
    // The validator is the one the other commands use, and runs before anything is read or written.
    const bad = capture();
    const out = join(dir, 'refused.pdf');
    expect(await run(['build', FZK, '--pac', '--locale', 'xx', '--out', out], bad.io)).toBe(EXIT.usage);
    expect(bad.err()).toBe('ifcsheet: --locale must be one of en, ro, not "xx".\n');
    expect(existsSync(out)).toBe(false);
  }, 300_000);

  it('writes "Nu este cazul" for the items 1.4.4 lifts with --intervention interior, and asks 1.4.4 of an intervention on an existing building', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-pac-'));
    dirs.push(dir);
    const answers = [PAC_WORDS_RO['pac.opis.yes'], PAC_WORDS_RO['pac.opis.no'], PAC_WORDS_RO['pac.opis.na']];
    const byPoint = async (works: string) => {
      const c = capture();
      expect(await run(['build', FZK, '--pac', '--intervention', works, '--out', join(dir, `${works}.pdf`)], c.io)).toBe(EXIT.ok);
      return opisRows((await readPages(new Uint8Array(readFileSync(join(dir, `${works}.pdf`)))))[0], answers).map((r) => r.included);
    };
    // The order of Anexa 2: 1.1, 1.2, 1.3, 1.4.2, plans, roof, facades, sections, context, 1.4.4 a) b) d), 1.5, 1.6.1 to 1.6.5.
    expect(await byPoint('existing')).toEqual(['Nu', 'Nu', 'Nu', 'Nu', 'Da', 'Nu', 'Da', 'Da', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu']);
    // Interior only: the roof plan, the facades and the photo documentation (inside point 1.4) are not needed; the situation plans (1.b, 1.c) still are.
    expect(await byPoint('interior')).toEqual(['Nu', 'Nu', 'Nu', 'Nu', 'Da', 'Nu este cazul', 'Nu este cazul', 'Da', 'Nu este cazul', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu', 'Nu']);
  });

  it('refuses --intervention without --pac or with an unknown value', async () => {
    const a = capture();
    expect(await run(['build', FZK, '--intervention', 'interior', '--out', 'x.pdf'], a.io)).toBe(EXIT.usage);
    const b = capture();
    expect(await run(['build', FZK, '--pac', '--intervention', 'demolition', '--out', 'x.pdf'], b.io)).toBe(EXIT.usage);
  });

  it('refuses --pac with --template, and --pac on another command', async () => {
    const a = capture();
    expect(await run(['build', FZK, '--pac', '--template', 'x.bvset', '--out', 'x.pdf'], a.io)).toBe(EXIT.usage);
    const b = capture();
    expect(await run(['check', FZK, '--pac'], b.io)).toBe(EXIT.usage);
  });
});
