/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `--json` and `--csv` output is the payload alone (#600): the real `ifcsheet` executable is run as a process, because
 * the geometry engine's "[IFC-LITE] ..." lines come from `console.log`, which a test that captures `run`'s `io` never sees.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(BIN) ? 'the package is not built (dist/bin.js)' : !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the stdout test of the CLI: ${missing}`);

const ifcsheet = (...args: string[]) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe.skipIf(missing !== null)('the stdout of a real ifcsheet run carries the payload only', () => {
  it('rooms --json parses as JSON, and the engine log is on stderr', () => {
    const r = ifcsheet('rooms', FZK, '--json');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ rooms: 7 });
    expect(r.out).not.toContain('[IFC-LITE]');
    expect(r.err).toContain('[IFC-LITE]');
  }, 120_000);

  it('rooms --csv starts with its header', () => {
    const r = ifcsheet('rooms', FZK, '--csv');
    expect(r.code).toBe(0);
    expect(r.out.split('\n')[0]).toBe('No.,Room,Level,Useful area m²,Perimeter m,Source');
  }, 120_000);

  it('check --json parses as JSON', () => {
    const r = ifcsheet('check', FZK, '--json');
    expect(JSON.parse(r.out)).toHaveProperty('findings');
  }, 120_000);

  // `build` runs in a child with more heap (#616); the redirect to stderr runs in whichever process runs the command, so the
  // child's engine log stays off the stdout it inherits. `build` has no `--json`: its stdout is the one summary line.
  it('build, which runs in the child, keeps the engine log off stdout and prints its one summary line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-stdout-'));
    try {
      const r = ifcsheet('build', FZK, '--out', join(dir, 'a.pdf'));
      expect(r.code).toBe(0);
      expect(r.out.trim().split('\n')).toHaveLength(1);
      expect(r.out).toMatch(/a\.pdf: \d+ sheets? /);
      expect(r.out).not.toContain('[IFC-LITE]');
      expect(r.err).toContain('[IFC-LITE]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('build --json is refused with nothing on stdout', () => {
    const r = ifcsheet('build', FZK, '--json', '--out', join(tmpdir(), 'never.pdf'));
    expect(r.code).not.toBe(0);
    expect(r.out).toBe('');
  }, 120_000);

  it('check --json, in this process, parses as JSON with the engine log on stderr', () => {
    const r = ifcsheet('check', FZK, '--json');
    expect(JSON.parse(r.out)).toHaveProperty('findings');
    expect(r.out).not.toContain('[IFC-LITE]');
    expect(r.err).toContain('[IFC-LITE]');
  }, 120_000);
});
