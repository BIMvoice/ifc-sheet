/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The building materials table (#90) as the engine reads it, and `ifcsheet materials`. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT, run } from './cli.js';
import { guessMaterial, materialGraphics, readMaterial, readMaterials, resolvedMaterial, type ProjectMaterial } from './materials.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';

const STEP = [
  'ISO-10303-21;', 'HEADER;', "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
  "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#2);", '#2=IFCUNITASSIGNMENT((#3));', '#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
  "#20=IFCMATERIAL('Concrete C25/30',$,$);", "#21=IFCMATERIAL('PE foil',$,$);", "#22=IFCMATERIAL('Mineral wool',$,$);", "#23=IFCMATERIAL('Mystery',$,$);",
  'ENDSEC;', 'END-ISO-10303-21;',
].join('\n');

const dirs: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ifcsheet-materials-'));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t) }, out: () => out.join(''), err: () => err.join('') };
};
const project = (materials: unknown, extra: object = {}): string => JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', ...extra, ...(materials === undefined ? {} : { materials }) });

describe('the table', () => {
  it('guesses a material from its name', () => {
    expect(guessMaterial('Concrete C25/30')).toMatchObject({ hatch: 'CONCRETE', hatchScale: 1 });
    expect(guessMaterial('Mineral wool').hatch).toBe('INSULATION');
    expect(guessMaterial('Vapour barrier')).toMatchObject({ membrane: true, hatch: null });
    expect(guessMaterial('Mystery')).toEqual({ hatch: null, hatchScale: 1 });
  });

  it('takes a name\'s row case- and space-insensitively, else the guess', () => {
    const rows: ProjectMaterial[] = [{ id: 'a', name: 'Mineral  wool', hatch: 'BRICK' }];
    expect(materialGraphics(' mineral WOOL ', rows)).toMatchObject({ auto: false, hatch: 'BRICK' });
    expect(materialGraphics('Concrete', rows)).toMatchObject({ auto: true, hatch: 'CONCRETE' });
  });

  it('reads a saved row and leaves off what is not valid, so the guess fills it', () => {
    expect(readMaterial({ id: 'a', name: 'X', hatch: 'BRICK', hatchScale: 2, fill: '#AABBCC', hatchPen: 'heavy', membrane: true })).toEqual([{ id: 'a', name: 'X', hatch: 'BRICK', hatchScale: 2, fill: '#AABBCC', hatchPen: 'heavy', membrane: true }]);
    expect(readMaterial({ id: 'a', name: 'X', hatchScale: -1, fill: 'red', hatchPen: 'thick', membrane: 'yes' })).toEqual([{ id: 'a', name: 'X' }]);
    expect(readMaterial({ id: 'a', name: 'X', hatch: null, fill: null })).toEqual([{ id: 'a', name: 'X', hatch: null, fill: null }]);
    expect(readMaterial({ id: 'a', name: '  ' })).toEqual([]);
    expect(readMaterial(null)).toEqual([]);
    expect(readMaterials('nope')).toEqual([]);
    expect(readMaterials([{ id: 'a', name: 'X' }, 3, { name: 'no id' }])).toEqual([{ id: 'a', name: 'X' }]);
  });

  it('fills every default of what a material draws with', () => {
    expect(resolvedMaterial(materialGraphics('Mystery', []))).toEqual({ name: 'Mystery', auto: true, hatch: null, hatchScale: 1, fill: 'ifc', hatchPen: 'hairline', membrane: false });
    expect(resolvedMaterial(materialGraphics('X', [{ id: 'a', name: 'X', hatch: 'BRICK', fill: null, hatchPen: 'heavy', membrane: true }]))).toEqual({ name: 'X', auto: false, hatch: 'BRICK', hatchScale: 1, fill: 'none', hatchPen: 'heavy', membrane: true });
  });
});

describe('ifcsheet materials', () => {
  const model = (): string => {
    const file = join(scratch(), 'm.ifc');
    writeFileSync(file, STEP);
    return file;
  };
  const projectFile = (text: string): string => {
    const file = join(scratch(), 'p.ifclite-project.json');
    writeFileSync(file, text);
    return file;
  };
  const json = async (...args: string[]) => {
    const c = capture();
    const code = await run(['materials', ...args, '--json'], c.io);
    return { code, err: c.err(), out: c.out() ? (JSON.parse(c.out()) as { materials: ReturnType<typeof resolvedMaterial>[]; project?: string }) : null };
  };

  it('lists the model\'s materials sorted, each as the name suggests, without a project', async () => {
    const { code, out, err } = await json(model());
    expect(err).toBe('');
    expect(code).toBe(EXIT.ok);
    expect(out!.materials.map((m) => [m.name, m.auto, m.hatch, m.membrane])).toEqual([
      ['Concrete C25/30', true, 'CONCRETE', false],
      ['Mineral wool', true, 'INSULATION', false],
      ['Mystery', true, null, false],
      ['PE foil', true, null, true],
    ]);
  });

  it('applies the project\'s rows: its hatch, scale, fill, pen and membrane, and guesses the rest', async () => {
    const p = projectFile(project([
      { id: 'a', name: 'concrete c25/30', hatch: 'BRICK', hatchScale: 2, fill: '#ffcc00', hatchPen: 'heavy' },
      { id: 'b', name: 'Mystery', membrane: true },
      { id: 'c', name: 'Not in the model', hatch: 'EARTH' },
    ]));
    const { out } = await json(model(), '--project', p);
    expect(out!.project).toBe(p);
    const byName = Object.fromEntries(out!.materials.map((m) => [m.name, m]));
    expect(byName['Concrete C25/30']).toEqual({ name: 'Concrete C25/30', auto: false, hatch: 'BRICK', hatchScale: 2, fill: '#ffcc00', hatchPen: 'heavy', membrane: false });
    expect(byName['Mystery']).toMatchObject({ auto: false, membrane: true });
    expect(byName['Mineral wool']).toMatchObject({ auto: true, hatch: 'INSULATION' });
    expect(byName['Not in the model']).toMatchObject({ auto: false, hatch: 'EARTH' });
  });

  it('a project with no materials key, or an empty list, changes nothing', async () => {
    const without = await json(model(), '--project', projectFile(project(undefined)));
    const empty = await json(model(), '--project', projectFile(project([])));
    const none = await json(model());
    expect(without.out!.materials).toEqual(none.out!.materials);
    expect(empty.out!.materials).toEqual(none.out!.materials);
  });

  it('prints plain text, a line per material', async () => {
    const c = capture();
    const p = projectFile(project([{ id: 'a', name: 'Mystery', hatch: 'WOOD', hatchScale: 2 }]));
    expect(await run(['materials', model(), '--project', p], c.io)).toBe(EXIT.ok);
    expect(c.out()).toContain('Concrete C25/30  hatch CONCRETE x1, hairline pen; fill ifc; guessed from the name');
    expect(c.out()).toContain('Mystery          hatch WOOD x2, hairline pen; fill ifc; from the project');
    expect(c.out()).toContain('PE foil          membrane (heavy dashed line); fill ifc; guessed from the name');
  });

  it('refuses a project that is not one, a newer one and a missing file, and a wrong command line', async () => {
    const m = model();
    for (const [text, why] of [['{"format":"other"}', 'Not a project file'], [project([], { version: PROJECT_FILE_VERSION + 1 }), 'newer than this build'], ['nope', 'invalid JSON']] as const) {
      const c = capture();
      expect(await run(['materials', m, '--project', projectFile(text)], c.io)).toBe(EXIT.failed);
      expect(c.err()).toContain(why);
    }
    const missing = capture();
    expect(await run(['materials', m, '--project', join(scratch(), 'none.json')], missing.io)).toBe(EXIT.failed);
    expect(missing.err()).toContain('no such file');
    const noModel = capture();
    expect(await run(['materials', join(scratch(), 'none.ifc')], noModel.io)).toBe(EXIT.failed);
    const usage = capture();
    expect(await run(['materials', m, '--out', 'x.pdf'], usage.io)).toBe(EXIT.usage);
    expect(await run(['materials'], capture().io)).toBe(EXIT.usage);
  });
});
