/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet check --project` (#260), on AC20-FZK-Haus. The expectations are written out from the IFC file, not read back
 * from the code under test: the file holds 5 doors (three 885x2010 and the two entrance doors) and 11 windows (2 of
 * 1000x1000 on the Dachgeschoss, 9 of 2000x1200 on the Erdgeschoss), none with a configured type.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};

const dirs: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-project-'));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const schedule = (id: string, name: string, sub?: { parent: string; filter: Record<string, unknown> }) => ({ id, name, kind: 'all', createdAt: 1, scale: 50, ...(sub ? { sub } : {}) });
const projectFile = (extra: Record<string, unknown>) => JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'Haus', ...extra });
const write = (name: string, text: string) => {
  const file = join(scratch(), name);
  writeFileSync(file, text);
  return file;
};

const findingsOf = async (argv: string[]) => {
  const c = capture();
  const code = await run(['check', FZK, '--json', ...argv], c.io);
  return { code, err: c.err(), json: c.err() === '' ? (JSON.parse(c.out()) as { project?: string; ready: boolean; findings: { kind: string; missing: string; effect: string; params: Record<string, unknown> }[] }) : null };
};

/** What the model alone says about FZK: 4 of 82 elements have no material. */
const MODEL_ONLY = [{ kind: 'noMaterials', missing: '4 of 82 elements have no material.', effect: expect.stringContaining('material takeoff'), params: { count: 4, total: 82 } }];

describe.skipIf(!existsSync(FZK))('ifcsheet check --project, on AC20-FZK-Haus', () => {
  it('reports a gap in a split schedule with the sentence the app shows', async () => {
    // Windows keeps only the 1000x1000 type: the nine 2000x1200 windows on the Erdgeschoss are in no part.
    const file = write('gap.ifclite-project.json', projectFile({
      schedules: [
        schedule('s1', 'Joinery'),
        schedule('s2', 'Doors', { parent: 's1', filter: { kinds: ['door'] } }),
        schedule('s3', 'Windows', { parent: 's1', filter: { kinds: ['window'], types: ['untyped:window:1000×1000'] } }),
      ],
    }));
    const { code, json } = await findingsOf(['--project', file]);
    expect(code).toBe(EXIT.failed);
    expect(json?.project).toBe(file);
    expect(json?.findings).toEqual([
      ...MODEL_ONLY,
      {
        kind: 'subReportGaps',
        missing: 'In "Joinery", some elements are in no part. Types: 1, elements: 9: W2 Window ×9 (Erdgeschoss).',
        effect: 'The parts do not add up to the schedule: those doors and windows are on no sheet.',
        params: { schedule: 'Joinery', types: 1, count: 9, list: 'W2 Window ×9 (Erdgeschoss)' },
      },
    ]);
  }, 120_000);

  it('reports an element listed in two parts, and the gap beside it', async () => {
    const file = write('both.ifclite-project.json', projectFile({
      schedules: [
        schedule('s1', 'Joinery'),
        schedule('s2', 'Doors', { parent: 's1', filter: { kinds: ['door'] } }),
        schedule('s3', 'Pick', { parent: 's1', filter: { types: ['untyped:door:885×2010'] } }),
        schedule('s4', 'Windows', { parent: 's1', filter: { kinds: ['window'], types: ['untyped:window:1000×1000'] } }),
      ],
    }));
    const { json } = await findingsOf(['--project', file]);
    expect(json?.findings.map((f) => [f.kind, f.missing])).toEqual([
      ['noMaterials', '4 of 82 elements have no material.'],
      ['subReportDuplicates', 'In "Joinery", more than one part lists the same type or element (Doors, Pick). Types: 1, elements: 3: D1 Door ×3 (Erdgeschoss).'],
      ['subReportGaps', 'In "Joinery", some elements are in no part. Types: 1, elements: 9: W2 Window ×9 (Erdgeschoss).'],
    ]);
  }, 120_000);

  it('stops reporting an element listed in two parts once the schedule keeps it apart on purpose (#186)', async () => {
    const parts = [
      schedule('s2', 'Doors', { parent: 's1', filter: { kinds: ['door'] } }),
      schedule('s3', 'Pick', { parent: 's1', filter: { types: ['untyped:door:885×2010'] } }),
      schedule('s4', 'Windows', { parent: 's1', filter: { kinds: ['window'], types: ['untyped:window:1000×1000'] } }),
    ];
    const kinds = async (keptApart: unknown) => {
      const file = write('kept.ifclite-project.json', projectFile({ schedules: [{ ...schedule('s1', 'Joinery'), ...(keptApart ? { keptApart } : {}) }, ...parts] }));
      return (await findingsOf(['--project', file])).json?.findings.map((f) => f.kind);
    };
    expect(await kinds(undefined)).toEqual(['noMaterials', 'subReportDuplicates', 'subReportGaps']);
    // The type's id keeps all three D1 doors apart; the gap beside it is a different problem and stays.
    expect(await kinds(['untyped:door:885×2010|'])).toEqual(['noMaterials', 'subReportGaps']);
    // An id that names no element of the duplicate changes nothing.
    expect(await kinds(['untyped:door:1010×2010|'])).toEqual(['noMaterials', 'subReportDuplicates', 'subReportGaps']);
  }, 120_000);

  it('says nothing more about a project whose parts add up', async () => {
    const file = write('clean.ifclite-project.json', projectFile({
      schedules: [
        schedule('s1', 'Joinery'),
        schedule('s2', 'Doors', { parent: 's1', filter: { kinds: ['door'] } }),
        schedule('s3', 'Windows', { parent: 's1', filter: { kinds: ['window'] } }),
      ],
    }));
    const { json } = await findingsOf(['--project', file]);
    expect(json?.findings).toEqual(MODEL_ONLY);
  }, 120_000);

  it('builds the rows with the project\'s catalogue and mapping: a mapped door is the catalogue\'s type, not a D1 group', async () => {
    // The 885x2010 doors are mapped by dimensions to the catalogue entry "T1" (885x2010), so they list under T1 (mark T1), not "Door".
    // Doors keeps only the unmapped entrance doors, so the three mapped doors are the gap, named by the catalogue's own mark and name.
    const file = write('mapped.ifclite-project.json', projectFile({
      joineryTypes: [{ id: 'cat-1', kind: 'door', name: 'Interior door', mark: 'T1', width: 0.885, height: 2.01 }],
      schedules: [
        schedule('s1', 'Joinery'),
        schedule('s2', 'Entrance', { parent: 's1', filter: { kinds: ['door'], types: ['untyped:door:1010×2010', 'untyped:door:2010×2375'] } }),
        schedule('s3', 'Windows', { parent: 's1', filter: { kinds: ['window'] } }),
      ],
    }));
    const { json } = await findingsOf(['--project', file]);
    const gap = json?.findings.find((f) => f.kind === 'subReportGaps');
    expect(gap?.missing).toBe('In "Joinery", some elements are in no part. Types: 1, elements: 3: T1 Interior door ×3 (Erdgeschoss).');
  }, 120_000);

  it('leaves the output exactly as it was without --project', async () => {
    const { json } = await findingsOf([]);
    expect(json).toEqual({ file: FZK, ready: false, findings: MODEL_ONLY });
  }, 120_000);

  it('reads a project from before sub-reports, and one with sections missing or damaged', async () => {
    // No version, no `sub`, no catalogue or mapping, a schedule list with junk in it: an ordinary schedule, nothing to check.
    const old = write('old.ifclite-project.json', JSON.stringify({ format: PROJECT_FILE_FORMAT, name: 'Old', schedules: [{ id: 's1', name: 'Joinery', kind: 'door' }, 7, null, { name: 'no id' }], joineryTypes: 'oops', joineryMapping: [1] }));
    const a = await findingsOf(['--project', old]);
    expect(a.err).toBe('');
    expect(a.json?.findings).toEqual(MODEL_ONLY);
    const bare = write('bare.ifclite-project.json', JSON.stringify({ format: PROJECT_FILE_FORMAT }));
    expect((await findingsOf(['--project', bare])).json?.findings).toEqual(MODEL_ONLY);
  }, 120_000);

  it('refuses what is not a usable project, with a message, and writes no findings', async () => {
    const cases: [string, string, RegExp][] = [
      ['json', '{nope', /invalid JSON/],
      ['other', JSON.stringify({ format: 'something-else' }), /\/format must be "ifclite-project"/],
      ['future', JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION + 1 }), /newer than this build reads/],
      ['version', JSON.stringify({ format: PROJECT_FILE_FORMAT, version: 'x' }), /\/version must be a whole number/],
    ];
    for (const [name, text, message] of cases) {
      const c = capture();
      expect(await run(['check', FZK, '--project', write(`${name}.json`, text)], c.io), name).toBe(EXIT.failed);
      expect(c.err(), name).toMatch(message);
      expect(c.out(), name).toBe('');
    }
    const c = capture();
    expect(await run(['check', FZK, '--project', join(scratch(), 'nope.json')], c.io)).toBe(EXIT.failed);
    expect(c.err()).toMatch(/cannot read .*nope\.json: no such file/);
  }, 120_000);

  it('takes --project for build to print the project\'s list schedules, and says when it cannot read it', async () => {
    const c = capture();
    expect(await run(['build', FZK, '--out', join(scratch(), 'x.pdf'), '--project', join(scratch(), 'missing.json')], c.io)).toBe(EXIT.failed);
    expect(c.err()).toContain('no such file');
    const d = capture();
    expect(await run(['build', FZK, '--out', join(scratch(), 'x.pdf'), '--schedule', 'a'], d.io)).toBe(EXIT.usage);
    expect(d.err()).toContain('ifcsheet build has no --schedule');
  });
});

const EXT_INT = fileURLToPath(new URL('./__fixtures__/exterior-interior.ifc', import.meta.url));

describe('ifcsheet check --project, with filters (#186)', () => {
  const run3 = async (interior: Record<string, unknown>) => {
    const file = write('ext-int.ifclite-project.json', projectFile({
      schedules: [
        schedule('s1', 'Joinery'),
        schedule('s2', 'Exterior', { parent: 's1', filter: { properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] } }),
        schedule('s3', 'Interior', { parent: 's1', filter: interior }),
      ],
    }));
    const c = capture();
    const code = await run(['check', EXT_INT, '--json', '--project', file], c.io);
    const findings = (JSON.parse(c.out()) as { findings: { kind: string; params: Record<string, unknown> }[] }).findings.filter((f) => f.kind.startsWith('subReport'));
    return { code, err: c.err(), findings };
  };

  it('finds exterior and interior apart a partition: no duplicate, no gap', async () => {
    const r = await run3({ properties: [{ name: 'IsExternal', op: 'notEquals', value: 'true' }] });
    expect(r.err).toBe('');
    expect(r.findings).toEqual([]);
  }, 120_000);

  it('reports the store door and the borrowed light, which say nothing, when the interior asks for IsExternal = false', async () => {
    const r = await run3({ properties: [{ name: 'IsExternal', op: 'equals', value: 'false' }] });
    expect(r.findings).toEqual([{ kind: 'subReportGaps', missing: expect.any(String), effect: expect.any(String), params: { schedule: 'Joinery', types: 2, count: 2, list: expect.stringContaining('×1') } }]);
  }, 120_000);
});
