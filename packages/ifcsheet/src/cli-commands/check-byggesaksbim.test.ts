/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet check --ids byggesaksbim` (#372): the flag, the project's opt-in, and that without either nothing is run. */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from '../project-version.js';
import { syntheticByggesaksbimModel } from '../byggesaksbim/synthetic-model.js';

// The real run, watched: the spy is how the opt-out tests know nothing was started.
const started = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../byggesaksbim/run.js', async (original) => {
  const real = await original<typeof import('../byggesaksbim/run.js')>();
  return { ...real, byggesaksbimReadiness: (...args: Parameters<typeof real.byggesaksbimReadiness>) => { started.calls++; return real.byggesaksbimReadiness(...args); } };
});
const { EXIT, run } = await import('../cli.js');
const { readProjectFile } = await import('../project-read.js');

const FZK = fileURLToPath(new URL('../../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-ids-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const file = (name: string, text: string) => { const p = join(dir, name); writeFileSync(p, text); return p; };
const project = (extra: object) => file(`p-${Math.random()}.json`, JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', ...extra }));
const kindsOf = async (argv: string[]) => {
  const c = capture();
  const code = await run(argv, c.io);
  return { code, kinds: (JSON.parse(c.out()) as { findings: { kind: string }[] }).findings.map((f) => f.kind) };
};

describe('ifcsheet check, ByggesaksBIM', () => {
  const compliant = file('compliant.ifc', syntheticByggesaksbimModel());
  const noBra = file('no-bra.ifc', syntheticByggesaksbimModel({ without: ['bra'] }));

  it('runs nothing without the flag or an opt-in, and says nothing about Norway', async () => {
    started.calls = 0;
    const a = await kindsOf(['check', noBra, '--json']);
    const b = await kindsOf(['check', noBra, '--json', '--project', project({ byggesaksbim: false })]);
    const c = await kindsOf(['check', noBra, '--json', '--project', project({})]);
    expect(started.calls).toBe(0);
    for (const r of [a, b, c]) expect(r.kinds.some((k) => k.startsWith('byggesaksbim'))).toBe(false);
  });

  it('runs on the flag, and reports the missing BRA', async () => {
    started.calls = 0;
    const r = await kindsOf(['check', noBra, '--ids', 'byggesaksbim', '--json']);
    expect(started.calls).toBe(1);
    expect(r.kinds.filter((k) => k.startsWith('byggesaksbim'))).toEqual(['byggesaksbimH5']);
    expect(r.code).toBe(EXIT.failed);
  });

  it('runs when the project opted in, without the flag', async () => {
    started.calls = 0;
    const r = await kindsOf(['check', noBra, '--json', '--project', project({ byggesaksbim: true })]);
    expect(started.calls).toBe(1);
    expect(r.kinds.filter((k) => k.startsWith('byggesaksbim'))).toEqual(['byggesaksbimH5']);
  });

  it('reads the opt-in from a project file the way the app writes it', () => {
    expect(readProjectFile(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, byggesaksbim: true })).byggesaksbim).toBe(true);
    expect(readProjectFile(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, byggesaksbim: 'yes' })).byggesaksbim).toBe(false);
  });

  it('has nothing to add on a compliant model', async () => {
    // The model has no rooms, so `check` is not green as a whole; Norway has nothing to add.
    expect((await kindsOf(['check', compliant, '--ids', 'byggesaksbim', '--json'])).kinds.filter((k) => k.startsWith('byggesaksbim'))).toEqual([]);
  });

  it('prints the finding as text, and refuses an unknown set or a command that has no --ids', async () => {
    const t = capture();
    expect(await run(['check', noBra, '--ids', 'byggesaksbim'], t.io)).toBe(EXIT.failed);
    expect(t.out()).toContain("BRA (usable area, Pset_BuildingStoreyCommon.NetPlannedArea) missing on 1 of 1 storeys: '1'.");
    const u = capture();
    expect(await run(['check', noBra, '--ids', 'other'], u.io)).toBe(EXIT.usage);
    expect(u.err()).toContain('unknown --ids "other"');
    const v = capture();
    expect(await run(['rooms', noBra, '--ids', 'byggesaksbim'], v.io)).toBe(EXIT.usage);
  });

  it.skipIf(!existsSync(FZK))('on FZK reports the matrikkel number and the two storey areas', async () => {
    const r = await kindsOf(['check', FZK, '--ids', 'byggesaksbim', '--json']);
    expect(r.kinds.filter((k) => k.startsWith('byggesaksbim'))).toEqual(['byggesaksbimH1', 'byggesaksbimH4', 'byggesaksbimH5']);
  }, 120_000);
});
