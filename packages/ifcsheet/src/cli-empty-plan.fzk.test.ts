/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet build` says on stderr which plan comes out blank (#615): the real executable, on a model whose Level 0 plan cut meets nothing and whose Level 1 plan does. */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const EMPTY = fileURLToPath(new URL('./__fixtures__/empty-plan-level.ifc', import.meta.url));
const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const WASM = fileURLToPath(new URL('../../wasm/pkg/ifc-lite_bg.wasm', import.meta.url));
const missing = !existsSync(BIN) ? 'the package is not built (dist/bin.js)' : !existsSync(FZK) ? 'AC20-FZK-Haus.ifc not found' : !existsSync(WASM) ? 'wasm bundle not built' : null;
if (missing) console.warn(`[ifcsheet] skipping the empty plan test of the CLI: ${missing}`);

/** The lines of stderr that are the warning (the engine's own log lines are not). */
const warnings = (err: string): string[] => err.split('\n').filter((l) => / the plan's cut shows nothing|tăietura planului/.test(l));

const build = (model: string, ...more: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-empty-plan-'));
  try {
    const r = spawnSync(process.execPath, [BIN, 'build', model, '--out', join(dir, 'a.pdf'), ...more], { encoding: 'utf8', maxBuffer: 1 << 26 });
    return { code: r.status, out: r.stdout, err: r.stderr, pdf: join(dir, 'a.pdf') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe.skipIf(missing !== null)('a plan whose drawing holds nothing is named on stderr', () => {
  it('says the sheet and view in English, for the empty plan only, with exit 0 and the summary alone on stdout', () => {
    const r = build(EMPTY);
    expect(r.code).toBe(0);
    expect(warnings(r.err)).toEqual(["A-101 Level 0: the plan's cut shows nothing, so the plan is blank on this sheet"]);
    expect(r.out.trim().split('\n')).toEqual([`${r.pdf}: 4 sheets (Empty plan)`]);
  }, 180_000);

  it('says it in Romanian with --locale ro', () => {
    const r = build(EMPTY, '--locale', 'ro');
    expect(r.code).toBe(0);
    expect(warnings(r.err)).toEqual(['A-101 Level 0: tăietura planului nu arată nimic, deci planul este gol pe această planșă']);
  }, 180_000);

  it('says nothing for a model whose plans all hold something', () => {
    const r = build(FZK);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/a\.pdf: \d+ sheets? /);
    expect(warnings(r.err)).toEqual([]);
  }, 180_000);
});
