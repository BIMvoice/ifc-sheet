/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet build` on AC20-FZK-Haus, and the command line's failures (#164). */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
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

describe.skipIf(missing !== null)('ifcsheet build --handover, on AC20-FZK-Haus (#83)', () => {
  it('packs the PDF, a DXF per sheet and the IFC unchanged, named by the pattern', async () => {
    const dir = scratch();
    const c = capture();
    const code = await run(['build', FZK, '--handover', join(dir, 'pkg', 'handover.zip'), '--name', 'Haus Test'], c.io);
    expect(c.err()).toBe('');
    expect(code).toBe(EXIT.ok);
    const entries = unzipSync(new Uint8Array(readFileSync(join(dir, 'pkg', 'handover.zip'))));
    expect(Object.keys(entries).sort()).toEqual(['A-101 Floor plans.dxf', 'A-201 Elevations south and north.dxf', 'A-202 Elevations east and west.dxf', 'A-301 Sections.dxf', 'AC20-FZK-Haus.ifc', 'Haus Test.pdf']);
    expect(Buffer.from(entries['AC20-FZK-Haus.ifc']).equals(readFileSync(FZK))).toBe(true);
    expect(pdfPages(Buffer.from(entries['Haus Test.pdf']))).toBe(4);
    for (const [name, data] of Object.entries(entries)) if (name.endsWith('.dxf')) expect(new DxfParser().parseSync(new TextDecoder().decode(data))?.entities.length, name).toBeGreaterThan(0);
  }, 300_000);

  it('names the files by --pattern, and needs --out or --handover', async () => {
    const dir = scratch();
    const c = capture();
    expect(await run(['build', FZK, '--handover', join(dir, 'p.zip'), '--pattern', '{project}_{number}'], c.io)).toBe(EXIT.ok);
    const names = Object.keys(unzipSync(new Uint8Array(readFileSync(join(dir, 'p.zip'))))).sort();
    expect(names.filter((n) => n.endsWith('.dxf')).every((n) => /^[A-Za-z0-9 ._-]+_A-\d+\.dxf$/.test(n))).toBe(true);
    const bad = capture();
    expect(await run(['build', FZK], bad.io)).toBe(EXIT.usage);
  }, 300_000);
});

describe.skipIf(!existsSync(FZK))('ifcsheet check, on AC20-FZK-Haus', () => {
  it('prints the finding in plain English and exits 1, because the drawings are weaker for it', async () => {
    const c = capture();
    expect(await run(['check', FZK], c.io)).toBe(EXIT.failed);
    expect(c.err()).toBe('');
    expect(c.out()).toContain('1 thing the model lacks');
    expect(c.out()).toContain('- 4 of 82 elements have no material.\n  The material takeoff leaves them out');
  }, 120_000);

  it('prints JSON with --json: the file, ready, and each finding with its kind, both sentences and the counts', async () => {
    const c = capture();
    expect(await run(['check', FZK, '--json'], c.io)).toBe(EXIT.failed);
    const json = JSON.parse(c.out()) as unknown;
    expect(json).toEqual({
      file: FZK,
      ready: false,
      findings: [{ kind: 'noMaterials', missing: '4 of 82 elements have no material.', effect: expect.stringContaining('material takeoff'), params: { count: 4, total: 82 } }],
    });
  }, 120_000);
});

describe('the ifcsheet command line', () => {
  it('exits 0 and says so when the model lacks nothing', async () => {
    const dir = scratch();
    const file = join(dir, 'empty.ifc');
    writeFileSync(file, 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'ViewDefinition [CoordinationView]\'),\'2;1\');\nFILE_NAME(\'e.ifc\',\'\',(\'\'),(\'\'),\'\',\'\',\'\');\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n');
    const c = capture();
    expect(await run(['check', file, '--json'], c.io)).toBe(EXIT.ok);
    expect(JSON.parse(c.out())).toEqual({ file, ready: true, findings: [] });
    const t = capture();
    expect(await run(['check', file], t.io)).toBe(EXIT.ok);
    expect(t.out()).toContain('the model has what the drawing set reads');
  });

  it('fails on a missing file for check as for build', async () => {
    const c = capture();
    expect(await run(['check', join(scratch(), 'nope.ifc')], c.io)).toBe(EXIT.failed);
    expect(c.err()).toMatch(/cannot read .*nope\.ifc: no such file/);
    expect(c.out()).toBe('');
  });

  it('rejects check without a model, with build options, and build with --json, as usage errors', async () => {
    for (const argv of [['check'], ['check', FZK, FZK], ['check', FZK, '--out', 'x.pdf'], ['build', FZK, '--out', 'x.pdf', '--json']]) {
      const c = capture();
      expect(await run(argv, c.io), argv.join(' ')).toBe(EXIT.usage);
      expect(c.err()).not.toBe('');
    }
  });

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
    expect(c.out()).toContain('ifcsheet build <model.ifc> [--out <set.pdf>]');
    expect(c.err()).toBe('');
  });

  it('prints the version', async () => {
    const c = capture();
    expect(await run(['--version'], c.io)).toBe(EXIT.ok);
    expect(c.out().trim()).toBe((JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version);
  });

  it('rejects a build without --out and an unknown command or option as a usage error', async () => {
    for (const argv of [['build', FZK], ['frobnicate'], ['build', FZK, '--out', 'x.pdf', '--standard', 'ro']]) {
      const c = capture();
      expect(await run(argv, c.io), argv.join(' ')).toBe(EXIT.usage);
      expect(c.err()).not.toBe('');
    }
  });
});
