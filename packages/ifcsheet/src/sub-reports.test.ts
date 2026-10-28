/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { readSubReport, readSubReportFilter, subReportData, type SplitData, type SplitEntry, type SubReportFilter } from './sub-reports.js';

interface Entry extends SplitEntry { mark: string; occurrences: { level: string; id: string }[] }

const LEVELS = ['Ground', 'Level 1', 'Level 2'];

/** 12 types, doors and windows, with 1-4 occurrences spread over the storeys: 31 elements, each with a unique id. */
function fixture(): SplitData<Entry> {
  let id = 0;
  const entries = Array.from({ length: 12 }, (_, i): Entry => {
    const occurrences = Array.from({ length: 1 + (i % 4) + (i === 11 ? 1 : 0) }, (_, j) => ({ level: LEVELS[(i + j) % 3], id: `e${id++}` }));
    const counts: Record<string, number> = {};
    for (const o of occurrences) counts[o.level] = (counts[o.level] ?? 0) + 1;
    return { key: `t${i}`, kind: i % 3 === 0 ? 'door' : 'window', mark: `${i % 3 === 0 ? 'D' : 'W'}${i}`, counts, total: occurrences.length, occurrences };
  });
  return { entries, levels: LEVELS };
}

const idsOf = (d: SplitData<Entry>) => d.entries.flatMap((e) => e.occurrences.map((o) => o.id));
const ALL = idsOf(fixture());

/** The ids the parts list, in total: a partition lists each element of the whole exactly once. */
function covers(parts: SubReportFilter[]): { missing: string[]; repeated: string[] } {
  const seen = new Map<string, number>();
  for (const f of parts) for (const id of idsOf(subReportData(fixture(), f))) seen.set(id, (seen.get(id) ?? 0) + 1);
  return { missing: ALL.filter((id) => !seen.has(id)), repeated: [...seen].filter(([, n]) => n > 1).map(([id]) => id) };
}

describe('subReportData', () => {
  it('the fixture is what the tests assume: 30 elements', () => {
    expect(ALL).toHaveLength(31);
    expect(new Set(ALL).size).toBe(ALL.length);
  });

  it('no filter, or an empty one, is the data itself', () => {
    const data = fixture();
    expect(subReportData(data, undefined)).toBe(data);
    expect(subReportData(data, {})).toBe(data);
  });

  it('doors and windows apart cover every element exactly once', () => {
    expect(covers([{ kinds: ['door'] }, { kinds: ['window'] }])).toEqual({ missing: [], repeated: [] });
    const doors = subReportData(fixture(), { kinds: ['door'] });
    expect(doors.entries.every((e) => e.kind === 'door')).toBe(true);
    expect(doors.entries.map((e) => e.mark)).toEqual(['D0', 'D3', 'D6', 'D9']);
  });

  it('one part per storey covers every element exactly once, and counts follow the occurrences', () => {
    expect(covers(LEVELS.map((l) => ({ levels: [l] })))).toEqual({ missing: [], repeated: [] });
    for (const level of LEVELS) {
      const part = subReportData(fixture(), { levels: [level] });
      expect(part.levels).toEqual([level]);
      for (const e of part.entries) {
        expect(Object.keys(e.counts)).toEqual([level]);
        expect(e.total).toBe(e.occurrences.length);
        expect(e.total).toBe(e.counts[level]);
        expect(e.occurrences.every((o) => o.level === level)).toBe(true);
      }
    }
  });

  it('types picked by hand: the rest goes to the other part, and the two cover everything once', () => {
    const picked = ['t1', 't4', 't5'];
    const rest = fixture().entries.map((e) => e.key).filter((k) => !picked.includes(k));
    expect(covers([{ types: picked }, { types: rest }])).toEqual({ missing: [], repeated: [] });
    expect(subReportData(fixture(), { types: picked }).entries.map((e) => e.key)).toEqual(picked);
  });

  it('dimensions combine: kind and storey together', () => {
    const part = subReportData(fixture(), { kinds: ['window'], levels: ['Ground'] });
    expect(part.entries.length).toBeGreaterThan(0);
    for (const e of part.entries) {
      expect(e.kind).toBe('window');
      expect(Object.keys(e.counts)).toEqual(['Ground']);
    }
  });

  it('a type listed in two parts is listed in both (the duplicate is the user\'s to resolve, later)', () => {
    expect(covers([{ types: ['t1', 't2'] }, { types: ['t2', 't3'] }]).repeated).toEqual(fixture().entries[2].occurrences.map((o) => o.id));
  });

  it('an empty list keeps nothing', () => {
    expect(subReportData(fixture(), { types: [] }).entries).toEqual([]);
    expect(subReportData(fixture(), { kinds: [] }).entries).toEqual([]);
  });

  it('does not change the data it is given', () => {
    const data = fixture();
    const before = JSON.stringify(data);
    subReportData(data, { levels: ['Ground'], kinds: ['door'] });
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe('reading a saved sub-report', () => {
  it('a schedule without one (a project saved before sub-reports) has none', () => {
    expect(readSubReport(undefined)).toBeUndefined();
    expect(readSubReport({})).toBeUndefined();
    expect(readSubReport({ parent: '' })).toBeUndefined();
  });

  it('reads the parent and the filter back', () => {
    const sub = { parent: 'sc3', filter: { kinds: ['window'], levels: ['Ground'], types: ['t1'] } };
    expect(readSubReport(JSON.parse(JSON.stringify(sub)))).toEqual(sub);
  });

  it('a damaged filter loads as "no restriction" for the damaged dimension', () => {
    expect(readSubReportFilter({ kinds: 'door', levels: [1, 'Ground', 'Ground'], types: null, extra: 1 })).toEqual({ levels: ['Ground'] });
    expect(readSubReportFilter({ kinds: ['door', 'wall'] })).toEqual({ kinds: ['door'] });
    expect(readSubReportFilter(7)).toEqual({});
  });
});
