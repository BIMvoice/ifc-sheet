/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet build` on AC20-FZK-Haus, and the command line's failures (#164). */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import DxfParserModule from 'dxf-parser';
import type { DxfParser as DxfParserInstance } from 'dxf-parser';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built: run `pnpm build:wasm:fetch`' : null;
if (missing) console.warn(`[ifcsheet] skipping the build test of the CLI: ${missing}`);

const DxfParser = DxfParserModule as unknown as new () => DxfParserInstance;
const pdfPages = (bytes: Buffer): number => (bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};

const dirs: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-cli-'));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(missing !== null)('ifcsheet build, on AC20-FZK-Haus', () => {
  it('writes a PDF with a page per sheet and a DXF per sheet that parses', async () => {
    const dir = scratch();
    const c = capture();
    const code = await run(['build', FZK, '--out', join(dir, 'sub', 'set.pdf'), '--dxf', join(dir, 'dxf'), '--name', 'Haus Test'], c.io);
    expect(c.err()).toBe('');
    expect(code).toBe(EXIT.ok);
    const pdf = readFileSync(join(dir, 'sub', 'set.pdf'));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdfPages(pdf)).toBe(4);
    expect(c.out()).toContain('4 sheets (Haus Test)');
    const files = readdirSync(join(dir, 'dxf')).sort();
    expect(files).toEqual(['A-101.dxf', 'A-201.dxf', 'A-202.dxf', 'A-301.dxf']);
    for (const file of files) {
      const parsed = new DxfParser().parseSync(readFileSync(join(dir, 'dxf', file), 'utf8'));
      expect(parsed?.entities.length, file).toBeGreaterThan(0);
    }
  }, 300_000);
});

describe('the ifcsheet command line', () => {
  it('fails with a clear message and a non-zero exit on a missing file, writing nothing', async () => {
    const dir = scratch();
    const c = capture();
    const code = await run(['build', join(dir, 'nope.ifc'), '--out', join(dir, 'set.pdf')], c.io);
    expect(code).toBe(EXIT.failed);
    expect(c.err()).toMatch(/cannot read .*nope\.ifc: no such file/);
    expect(existsSync(join(dir, 'set.pdf'))).toBe(false);
  });

  it('prints the usage for --help and exits 0', async () => {
    const c = capture();
    expect(await run(['--help'], c.io)).toBe(EXIT.ok);
    expect(c.out()).toContain('ifcsheet build <model.ifc> --out <set.pdf>');
    expect(c.err()).toBe('');
  });

  it('prints the version', async () => {
    const c = capture();
    expect(await run(['--version'], c.io)).toBe(EXIT.ok);
    expect(c.out().trim()).toBe((JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version);
  });

  it('says check is not available yet, naming the issue, and exits non-zero', async () => {
    const c = capture();
    const code = await run(['check', FZK], c.io);
    expect(code).not.toBe(EXIT.ok);
    expect(c.err()).toContain('not available yet');
    expect(c.err()).toContain('#164');
  });

  it('rejects a build without --out and an unknown command or option as a usage error', async () => {
    for (const argv of [['build', FZK], ['frobnicate'], ['build', FZK, '--out', 'x.pdf', '--standard', 'ro']]) {
      const c = capture();
      expect(await run(argv, c.io), argv.join(' ')).toBe(EXIT.usage);
      expect(c.err()).not.toBe('');
    }
  });
});
