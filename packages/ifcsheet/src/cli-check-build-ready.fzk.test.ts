/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `check` and `build` agree on a model with no geometry (#604): the one rule is `hasDrawableGeometry`, which
 * `generateDefaultSet` (so `build`) and `readinessOfModel` (so `check`, and the MCP tool) both ask.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';

const NO_GEOMETRY = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/rooms-with-finishes.ifc', import.meta.url));
const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(NO_GEOMETRY) || !existsSync(FZK) ? 'fixtures not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the readiness agreement test: ${missing}`);

const dir = mkdtempSync(join(tmpdir(), 'cli-ready-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function go(argv: string[]): Promise<{ out: string; err: string; code: number }> {
  let out = '';
  let err = '';
  const code = await run(argv, { stdout: (t) => { out += t; }, stderr: (t) => { err += t; } });
  return { out, err, code };
}

interface Report { ready: boolean; findings: { kind: string; missing: string }[] }

describe.skipIf(missing !== null)('check and build on a model with no geometry', () => {
  it('check reports it as not ready and build refuses it', async () => {
    const check = await go(['check', NO_GEOMETRY, '--json']);
    const report = JSON.parse(check.out) as Report;
    expect(report.ready).toBe(false);
    expect(report.findings.map((f) => f.kind)).toContain('noGeometry');
    expect(check.code).toBe(EXIT.failed);
    const build = await go(['build', NO_GEOMETRY, '--out', join(dir, 'x.pdf')]);
    expect(build.code).toBe(EXIT.failed);
    expect(build.err).toContain('no geometry');
  }, 120_000);

  it('check says it in Romanian under --locale ro', async () => {
    const report = JSON.parse((await go(['check', NO_GEOMETRY, '--json', '--locale', 'ro'])).out) as Report;
    expect(report.findings.find((f) => f.kind === 'noGeometry')?.missing).toBe('Modelul nu are geometrie de desenat.');
  }, 120_000);

  it('a model with geometry raises no such finding', async () => {
    const report = JSON.parse((await go(['check', FZK, '--json'])).out) as Report;
    expect(report.findings.map((f) => f.kind)).not.toContain('noGeometry');
  }, 120_000);

  it('check exits 0 on a model that has geometry and lacks nothing: FZK with the four doors and windows given a material', async () => {
    const text = readFileSync(FZK, 'utf8');
    // The only finding FZK has is 4 elements without a material: the two doors and the two windows.
    const rel = "#99999001= IFCRELASSOCIATESMATERIAL('1viJCZMGQN1RwVmEd$KW99',#12,$,$,(#27013,#31079,#66459,#74280),#14521);\n";
    const file = join(dir, 'fzk-complete.ifc');
    const at = text.lastIndexOf('ENDSEC;');
    writeFileSync(file, text.slice(0, at) + rel + text.slice(at));
    const check = await go(['check', file, '--json']);
    expect(JSON.parse(check.out)).toEqual({ file, ready: true, findings: [] });
    expect(check.code).toBe(EXIT.ok);
  }, 120_000);
});
