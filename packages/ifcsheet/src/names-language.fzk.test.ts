/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The names a generated set gets follow the project's language (#53), on the command line as in the app: a project that
 * records `ro`, or `--locale ro`, names the starting set of AC20-FZK-Haus in Romanian; with neither it is English, byte for
 * byte what it was. The app's own Romanian is these same strings (`names.ts`), so one language gives one set of names.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { generateDefaultSet, nameOf } from './index.js';
import { openModel } from './headless.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;

const EN_SHEETS = ['Floor plans', 'Elevations, south and north', 'Elevations, east and west', 'Sections'];
const RO_SHEETS = ['Planuri', 'Fațade sud și nord', 'Fațade est și vest', 'Secțiuni'];
/** The DXF files of the handover package carry the sheet names (diacritics folded); the project name is the PDF's. */
const EN_DXF = ['A-101 Floor plans.dxf', 'A-201 Elevations south and north.dxf', 'A-202 Elevations east and west.dxf', 'A-301 Sections.dxf'];
const RO_DXF = ['A-101 Planuri.dxf', 'A-201 Fatade sud si nord.dxf', 'A-202 Fatade est si vest.dxf', 'A-301 Sectiuni.dxf'];

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const dirs: string[] = [];
const scratch = () => { const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-names-language-')); dirs.push(dir); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const project = (dir: string, extra: Record<string, unknown>): string => {
  const file = join(dir, 'p.ifclite-project.json');
  writeFileSync(file, JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Proiect', ...extra }));
  return file;
};

/** The names of the DXF files `ifcsheet build` packs for `args`, sorted. */
async function builtDxfNames(args: string[], said = ''): Promise<string[]> {
  const dir = scratch();
  const c = capture();
  const code = await run(['build', FZK, '--handover', join(dir, 'h.zip'), '--name', 'Haus Test', ...args], c.io);
  // A project with no sheet says it lays a fresh set out (#479); these tests are about the language, so that note is set aside.
  expect(c.err().split('\n').filter((l) => !l.includes('holds no drawing set')).join('\n')).toBe(said);
  expect(code).toBe(EXIT.ok);
  return Object.keys(unzipSync(new Uint8Array(readFileSync(join(dir, 'h.zip'))))).filter((n) => n.endsWith('.dxf')).sort();
}

describe.skipIf(missing !== null)('generated names follow the language, on AC20-FZK-Haus', () => {
  it('names the engine set in Romanian under language ro, records it, and leaves the installed language as it was', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const ro = generateDefaultSet(model, { language: 'ro' })!;
    expect(ro.document.sheets.map((s) => s.name)).toEqual(RO_SHEETS);
    expect(ro.document.views.filter((v) => /^Fațada /.test(v.name)).map((v) => v.name).sort()).toEqual(['Fațada est', 'Fațada nord', 'Fațada sud', 'Fațada vest']);
    expect(ro.document.views.filter((v) => /^Secțiunea /.test(v.name)).map((v) => v.name)).toEqual(['Secțiunea A-A', 'Secțiunea B-B']);
    expect(ro.document.viewTemplates?.map((t) => t.name)).toEqual(['Planuri', 'Secțiuni', 'Fațade']);
    expect(ro.document.language).toBe('ro');
    // The storey names are the model's, not ours.
    expect(ro.document.views.map((v) => v.name)).toContain('Erdgeschoss');
    expect(nameOf('names.sheet.plans')).toBe('Floor plans');
  }, 120_000);

  it('is English and records nothing without a language, and English for a language it has no names in', async () => {
    const model = await openModel(new Uint8Array(readFileSync(FZK)));
    const plain = generateDefaultSet(model)!;
    expect(plain.document.sheets.map((s) => s.name)).toEqual(EN_SHEETS);
    expect('language' in plain.document).toBe(false);
    const other = generateDefaultSet(model, { language: 'de' })!;
    expect(other.document.sheets.map((s) => s.name)).toEqual(EN_SHEETS);
    expect(other.document.language).toBe('en');
  }, 120_000);

  it('build: English with no project and no --locale, as before', async () => {
    expect(await builtDxfNames([])).toEqual(EN_DXF);
  }, 300_000);

  it('build --locale ro names the set in Romanian', async () => {
    expect(await builtDxfNames(['--locale', 'ro'])).toEqual(RO_DXF);
  }, 300_000);

  it('build --project of a project that records ro names the set in Romanian without --locale', async () => {
    expect(await builtDxfNames(['--project', project(scratch(), { language: 'ro' })])).toEqual(RO_DXF);
  }, 300_000);

  it('build: the project\'s language wins over --locale, and a project that records none follows --locale', async () => {
    expect(await builtDxfNames(['--project', project(scratch(), { language: 'en' }), '--locale', 'ro'], "ifcsheet: --locale ro differs from the project's language en; using en.\n")).toEqual(EN_DXF);
    expect(await builtDxfNames(['--project', project(scratch(), {}), '--locale', 'ro'])).toEqual(RO_DXF);
    expect(await builtDxfNames(['--project', project(scratch(), {})])).toEqual(EN_DXF);
  }, 300_000);

  it('build --locale of a language it has no names in is a usage error naming ro and en, and writes nothing', async () => {
    const c = capture();
    const out = join(scratch(), 'refused.pdf');
    expect(await run(['build', FZK, '--out', out, '--locale', 'de'], c.io)).toBe(EXIT.usage);
    expect(c.err()).toBe('ifcsheet: --locale must be one of en, ro, not "de".\n');
    expect(existsSync(out)).toBe(false);
  });

  it('build: a --locale the project overrides is said on stderr in one line, and the project\'s language is used', async () => {
    const c = capture();
    const dxf = join(scratch(), 'dxf');
    expect(await run(['build', FZK, '--out', join(scratch(), 'a.pdf'), '--dxf', dxf, '--project', project(scratch(), { language: 'en' }), '--locale', 'ro'], c.io)).toBe(EXIT.ok);
    expect(c.err().split('\n').filter((l) => l.includes('--locale'))).toEqual(["ifcsheet: --locale ro differs from the project's language en; using en."]);
    const quiet = capture();
    await run(['build', FZK, '--out', join(scratch(), 'b.pdf'), '--project', project(scratch(), { language: 'ro' }), '--locale', 'ro'], quiet.io);
    expect(quiet.err()).not.toContain('--locale');
  }, 300_000);
});
