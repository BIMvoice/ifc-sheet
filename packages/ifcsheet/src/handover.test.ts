/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The names of the handover package (#83): the pattern, the safe ASCII name, the collision suffix and the length limit. */

import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  asciiStem, buildHandoverZip, HANDOVER_DEFAULT_PATTERN, HANDOVER_NAME_MAX, handoverFileName, nameHandoverFiles, readHandoverPattern, uniqueHandoverNames,
  type HandoverPart,
} from './handover.js';

const dxf = (tokens: HandoverPart['tokens'], data = 'x'): HandoverPart => ({ kind: 'dxf', extension: 'dxf', tokens, data: new TextEncoder().encode(data) });

describe('a file name from the pattern', () => {
  it('fills every token', () => {
    const tokens = { project: 'Casa Mare', number: 'A-101', sheet: 'Ground floor', revision: 'B', date: '2026-10-25', issue: 'Issue 1' };
    expect(handoverFileName('{project} {number} {sheet} {revision} {date}', tokens, 'dxf')).toBe('Casa Mare A-101 Ground floor B 2026-10-25.dxf');
    expect(handoverFileName(HANDOVER_DEFAULT_PATTERN, tokens, 'dxf')).toBe('A-101 Ground floor.dxf');
    expect(handoverFileName('{issue}_{number}-r{revision}', tokens, 'pdf')).toBe('Issue 1_A-101-rB.pdf');
  });

  it('leaves out a token with no value together with the separator after it', () => {
    expect(handoverFileName('{number} - {sheet}', { sheet: 'Issue 1' }, 'pdf')).toBe('Issue 1.pdf');
    expect(handoverFileName('{project} - {number} - {sheet}', { project: 'P', sheet: 'S' }, 'pdf')).toBe('P - S.pdf');
    expect(handoverFileName('{sheet} rev {revision}', { sheet: 'S' }, 'pdf')).toBe('S rev.pdf');
    expect(handoverFileName('{sheet} {nonsense}', { sheet: 'S' }, 'pdf')).toBe('S.pdf');
  });

  it('is plain ASCII: Romanian and other diacritics are folded, not mangled', () => {
    expect(asciiStem('Secțiune longitudinală, Ștefan Țepeș')).toBe('Sectiune longitudinala Stefan Tepes');
    expect(handoverFileName('{sheet}', { sheet: 'Străbătută Œuvre Größe Łódź' }, 'dxf')).toBe('Strabatuta OEuvre Grosse Lodz.dxf');
    expect(handoverFileName('{sheet}', { sheet: '平面図' }, 'dxf', 'sheet')).toBe('sheet.dxf');
  });

  it('has no path separators or reserved characters, and cannot climb out of the folder', () => {
    for (const hostile of ['../../etc/passwd', 'a/b\\c', 'C:\\x', 'a:b*c?d"e<f>g|h', '..', '.hidden', 'tab\tnew\nline']) {
      const name = handoverFileName('{sheet}', { sheet: hostile }, 'xlsx');
      expect(name, hostile).toMatch(/^[A-Za-z0-9][A-Za-z0-9._ -]*\.xlsx$/);
      expect(name, hostile).not.toMatch(/[\\/:*?"<>|\t\n]/);
      expect(name.startsWith('.'), hostile).toBe(false);
    }
    expect(handoverFileName('{sheet}', { sheet: 'a/b' }, 'dxf')).toBe('a-b.dxf');
    expect(handoverFileName('{sheet}', { sheet: 'CON' }, 'dxf')).toBe('CON_.dxf');
  });

  it('is cut to the limit with its extension kept', () => {
    const name = handoverFileName('{sheet}', { sheet: 'x'.repeat(500) }, 'xlsx');
    expect(name.length).toBe(HANDOVER_NAME_MAX);
    expect(name.endsWith('.xlsx')).toBe(true);
    expect(handoverFileName('{sheet}', { sheet: `${'word '.repeat(40)}` }, 'pdf').length).toBeLessThanOrEqual(HANDOVER_NAME_MAX);
  });

  it('names a file the pattern leaves nameless, and takes a wrong extension for dat', () => {
    expect(handoverFileName('{revision}', {}, 'dxf', 'dxf')).toBe('dxf.dxf');
    expect(handoverFileName('{sheet}', { sheet: 'S' }, '../x')).toBe('S.x');
  });
});

describe('the stored pattern', () => {
  it('is read as text of a usable length, else it is absent (the default applies)', () => {
    expect(readHandoverPattern('  {number} {sheet} rev {revision} ')).toBe('{number} {sheet} rev {revision}');
    for (const bad of [undefined, null, 4, '', '   ', 'x'.repeat(201), {}]) expect(readHandoverPattern(bad)).toBeUndefined();
  });

  it('is not needed: a project made before the package names its files as an issue always has', () => {
    const files = nameHandoverFiles(undefined, [dxf({ number: 'A-101', sheet: 'Ground floor' })]);
    expect(files.map((f) => f.name)).toEqual(['A-101 Ground floor.dxf']);
    expect(nameHandoverFiles('', [dxf({ number: 'A-101', sheet: 'Ground floor' })]).map((f) => f.name)).toEqual(['A-101 Ground floor.dxf']);
  });
});

describe('two files with one name', () => {
  it('get (2), (3), whatever the case, and the suffix stays inside the limit', () => {
    expect(uniqueHandoverNames(['a.dxf', 'A.DXF', 'a.dxf', 'b.dxf'])).toEqual(['a.dxf', 'A (2).DXF', 'a (3).dxf', 'b.dxf']);
    const long = `${'x'.repeat(95)}.dxf`.slice(0, HANDOVER_NAME_MAX);
    const names = uniqueHandoverNames([long, long, long]);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(HANDOVER_NAME_MAX);
  });

  it('are named apart in the package: a pattern without a number gives every sheet one name', () => {
    const files = nameHandoverFiles('{project}', [dxf({ project: 'P' }), dxf({ project: 'P' }), dxf({ project: 'P' })]);
    expect(files.map((f) => f.name)).toEqual(['P.dxf', 'P (2).dxf', 'P (3).dxf']);
  });
});

describe('the package', () => {
  it('is a ZIP whose entries are exactly the names, holding each file unchanged', () => {
    const { zip, files } = buildHandoverZip(undefined, [dxf({ number: 'A-1', sheet: 'One' }, 'one'), dxf({ number: 'A-1', sheet: 'One' }, 'two')]);
    const entries = unzipSync(zip);
    expect(Object.keys(entries).sort()).toEqual(files.map((f) => f.name).sort());
    expect(Object.keys(entries).sort()).toEqual(['A-1 One (2).dxf', 'A-1 One.dxf']);
    expect(new TextDecoder().decode(entries['A-1 One.dxf'])).toBe('one');
    expect(new TextDecoder().decode(entries['A-1 One (2).dxf'])).toBe('two');
  });
});
