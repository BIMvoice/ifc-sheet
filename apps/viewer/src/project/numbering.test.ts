/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheet numbering by pattern (#87): the default scheme is today's numbers,
 * the sequential scheme is A01, A02…, a number typed by hand survives a
 * renumbering, and a saved scheme comes back as written or as today's.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingSet, withViewHung, type ModelExtent } from './drawing-set.js';
import { DEFAULT_SCHEME, nextNumber, numberAt, numberSheets, planRenumber, readNumberingScheme, renumbered, SEQUENTIAL_SCHEME } from './numbering.js';
import { defaultViews } from './view-defaults.js';
import type { NumberingScheme, ProjectLevel, ProjectSheet, ProjectView } from './types';

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const storeys = (n: number): ProjectLevel[] => Array.from({ length: n }, (_, i) => ({ name: `Level ${i}`, elevation: i * 3, storeyGlobalIds: [`L${i}`] }));
const section = (i: number): ProjectView => ({ id: `sec${i}`, kind: 'section', name: `Section ${i}`, createdAt: i, plane: { axis: 'down', position: i, flipped: false } }) as unknown as ProjectView;
/** Five storeys and five sections: plans A-101..A-103, four elevations A-201/202, sections A-301..A-303. */
const views = [...defaultViews(storeys(5)), ...[1, 2, 3, 4, 5].map(section)];
const sheet = (id: string, number: string, extra: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name: id, createdAt: 0, ...extra });

describe('the default scheme is today\'s numbering', () => {
  const set = buildDrawingSet({ views, extent: HOUSE });
  it('numbers the starting set exactly as the hard-coded series did (A-101+, A-201+, A-301+)', () => {
    assert.deepEqual(set.map((s) => s.number), ['A-101', 'A-102', 'A-103', 'A-201', 'A-202', 'A-301', 'A-302', 'A-303']);
  });
  it('gives a schedule A-601, a detail A-901 and the next of a group the next free number', () => {
    assert.equal(nextNumber([], 'schedules'), 'A-601');
    assert.equal(nextNumber([sheet('a', 'A-601')], 'schedules'), 'A-602');
    assert.equal(nextNumber(set, 'plans'), 'A-104');
    const detail = { id: 'det', kind: 'plan', name: 'Det', createdAt: 0, level: { name: 'L', elevation: 0 }, detail: { number: 1, of: 'x', min: { x: 0, y: 0 }, max: { x: 2, y: 2 } } } as unknown as ProjectView;
    assert.equal(withViewHung(set, [...views, detail], detail, HOUSE)?.sheets.at(-1)?.number, 'A-901');
  });
});

describe('a different scheme', () => {
  it('A01, A02 numbers the set through in set order', () => {
    const set = buildDrawingSet({ views, extent: HOUSE, scheme: SEQUENTIAL_SCHEME });
    assert.deepEqual(set.map((s) => s.number), ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08']);
  });

  it('writes discipline, prefix, separator, padding, start and step', () => {
    const scheme: NumberingScheme = { discipline: 'AR', continuous: false, groups: { ...DEFAULT_SCHEME.groups, elevations: { prefix: 'E', separator: '.', start: 10, digits: 4, step: 5 } } };
    assert.deepEqual([0, 1, 2].map((i) => numberAt(scheme, 'elevations', i)), ['ARE.0010', 'ARE.0015', 'ARE.0020']);
    assert.equal(numberAt(scheme, 'plans', 0), 'AR-101');
  });

  it('a new sheet follows the scheme, and skips a number already taken', () => {
    const taken = [sheet('a', 'A01'), sheet('b', 'A02')];
    assert.equal(nextNumber(taken, 'sections', SEQUENTIAL_SCHEME), 'A03');
    assert.equal(nextNumber([sheet('a', ' a01 ')], 'plans', SEQUENTIAL_SCHEME), 'A02', 'case and spaces do not make a number different');
  });

  it('a sheet from an older file, with no series, is renumbered in the group its number reads as', () => {
    const old = [sheet('p', 'A-101'), sheet('e', 'A-201'), sheet('x', 'Cover')];
    const scheme: NumberingScheme = { ...DEFAULT_SCHEME, discipline: 'B' };
    assert.deepEqual([...numberSheets(old, scheme)], [['p', 'B-101'], ['e', 'B-201'], ['x', 'B-901']]);
  });
});

describe('a number typed by hand', () => {
  const mixed = [sheet('a', 'A-101', { series: 'plans' }), sheet('b', 'X-7', { series: 'plans', numberOverride: true }), sheet('c', 'A-102', { series: 'plans' })];
  it('is kept by a renumbering, and the run does not reuse it', () => {
    assert.deepEqual([...numberSheets(mixed, SEQUENTIAL_SCHEME)], [['a', 'A01'], ['b', 'X-7'], ['c', 'A02']]);
    const clash = [sheet('a', 'A-101', { series: 'plans' }), sheet('b', 'A02', { series: 'plans', numberOverride: true }), sheet('c', 'A-102', { series: 'plans' })];
    assert.deepEqual([...numberSheets(clash, SEQUENTIAL_SCHEME)].map(([, n]) => n), ['A01', 'A02', 'A03']);
  });
  it('is renumbered too when asked, and is then no longer an override', () => {
    const rows = planRenumber(mixed, SEQUENTIAL_SCHEME, 'renumber');
    assert.deepEqual(rows.map((r) => r.to), ['A01', 'A02', 'A03']);
    assert.ok(renumbered(mixed, rows, 'renumber').every((s) => s.numberOverride === undefined));
  });
  it('the preview marks the kept ones', () => {
    assert.deepEqual(planRenumber(mixed, SEQUENTIAL_SCHEME).map((r) => r.kept), [false, true, false]);
  });
});

describe('a scheme in a project file', () => {
  it('comes back as it was saved', () => {
    assert.deepEqual(readNumberingScheme(JSON.parse(JSON.stringify(SEQUENTIAL_SCHEME))), SEQUENTIAL_SCHEME);
  });
  it('takes today\'s value for a field that is missing or out of range, and is absent when it is not a scheme', () => {
    const read = readNumberingScheme({ discipline: 'S', groups: { plans: { start: -4, digits: 99, step: 0, prefix: 3 } } });
    assert.deepEqual(read?.groups.plans, DEFAULT_SCHEME.groups.plans);
    assert.equal(read?.discipline, 'S');
    assert.equal(readNumberingScheme('x'), undefined);
  });
});
