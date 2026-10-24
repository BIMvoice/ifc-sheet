/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { checkSubReports, isClean, keepId, type CheckEntry, type CheckPart, type SubReportCheck } from './sub-report-check.js';
import { describeReadiness, modelReadiness, type ModelFacts } from './readiness.js';
import { subReportData, type SplitData } from './sub-reports.js';

const occ = (globalId: string, level: string, number: number) => ({ level, globalId, number, modelId: 'm', expressId: Number(globalId.replace(/\D/g, '')) });

/** Eleven elements of five types, written out by hand so the expectations below are independent of the code under test. */
function house(): SplitData<CheckEntry> {
  const entry = (key: string, kind: 'door' | 'window', mark: string, name: string, occurrences: CheckEntry['occurrences']): CheckEntry => {
    const counts: Record<string, number> = {};
    for (const o of occurrences) counts[o.level] = (counts[o.level] ?? 0) + 1;
    return { key, kind, mark, name, counts, total: occurrences.length, occurrences };
  };
  return {
    levels: ['Ground', 'Level 1'],
    entries: [
      entry('w1', 'window', 'W1', 'Window', [occ('g1', 'Ground', 1), occ('g2', 'Ground', 2), occ('g3', 'Level 1', 3)]),
      entry('w2', 'window', 'W2', 'Fixed window', [occ('g4', 'Ground', 1)]),
      entry('d1', 'door', 'D1', 'Door', [occ('g5', 'Ground', 1), occ('g6', 'Ground', 2), occ('g7', 'Level 1', 3), occ('g8', 'Level 1', 4)]),
      entry('d2', 'door', 'D2', 'Fire door', [occ('g9', 'Level 1', 1)]),
      entry('w3', 'window', 'W3', 'Skylight', []),
    ],
  };
}
const TOTAL_ELEMENTS = 9;
const parent = { id: 'joinery', name: 'Joinery', data: house() };
const part = (id: string, filter: CheckPart['filter']): CheckPart => ({ id, name: id[0].toUpperCase() + id.slice(1), filter });
const check = (...parts: CheckPart[]): SubReportCheck => checkSubReports(parent, parts);
const COMPLETE: ModelFacts = { storeys: 2, spaces: 5, elements: 100, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 };

describe('a partition with no overlap', () => {
  const partitions: [string, CheckPart[]][] = [
    ['doors and windows apart', [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'] })]],
    ['one part per storey', [part('ground', { levels: ['Ground'] }), part('level1', { levels: ['Level 1'] })]],
    ['types picked by hand', [part('a', { types: ['w1', 'd1'] }), part('b', { types: ['w2', 'd2', 'w3'] })]],
    ['doors apart, windows picked by hand', [part('doors', { kinds: ['door'] }), part('w', { kinds: ['window'], types: ['w1', 'w2', 'w3'] })]],
  ];
  for (const [name, parts] of partitions) {
    it(`${name}: no duplicate, no gap, no finding`, () => {
      // Independent of the check: the parts together hold exactly the whole's elements, once each.
      const held = parts.flatMap((p) => subReportData(parent.data, p.filter).entries.flatMap((e) => e.occurrences.map((o) => o.globalId)));
      expect(held.sort()).toEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9']);
      expect(held).toHaveLength(TOTAL_ELEMENTS);
      const c = check(...parts);
      expect(c.duplicates).toEqual([]);
      expect(c.gaps).toEqual([]);
      expect(c.fixes).toEqual([]);
      expect(isClean(c)).toBe(true);
      expect(modelReadiness(COMPLETE, [c])).toEqual([]);
    });
  }

  it('lists a type in each storey part without calling it a duplicate: it is the elements that must not repeat', () => {
    const c = check(part('ground', { levels: ['Ground'] }), part('level1', { levels: ['Level 1'] }));
    const inBoth = subReportData(parent.data, { levels: ['Ground'] }).entries.map((e) => e.key).filter((k) => subReportData(parent.data, { levels: ['Level 1'] }).entries.some((e) => e.key === k));
    expect(inBoth).toEqual(['w1', 'd1']);
    expect(c.duplicates).toEqual([]);
  });

  it('has nothing to check while the schedule has no parts', () => {
    expect(check()).toMatchObject({ duplicates: [], gaps: [], fixes: [], parts: [] });
  });
});

describe('an overlap', () => {
  it('names the exact duplicated type and element, and the parts that both list it', () => {
    const c = check(part('windows', { kinds: ['window'] }), part('doors', { kinds: ['door'] }), part('pick', { types: ['w2'] }));
    expect(c.gaps).toEqual([]);
    expect(c.duplicates).toEqual([{
      key: 'w2', label: 'W2 Fixed window', levels: ['Ground'],
      elements: [{ globalId: 'g4', mark: 'W2.1', level: 'Ground' }],
      parts: [{ id: 'windows', name: 'Windows' }, { id: 'pick', name: 'Pick' }],
    }]);
  });

  it('names only the elements both parts hold when the parts overlap on some storeys', () => {
    const c = check(part('ground', { levels: ['Ground'] }), part('doors', { kinds: ['door'] }), part('rest', { kinds: ['window'], levels: ['Level 1'] }));
    expect(c.duplicates.map((d) => [d.key, d.elements.map((e) => e.globalId)])).toEqual([['d1', ['g5', 'g6']]]);
    expect(c.duplicates[0].parts.map((p) => p.id)).toEqual(['ground', 'doors']);
  });

  it('counts a type with no element yet that two parts list as a duplicate of its own', () => {
    const c = check(part('a', { types: ['w3', 'w1'] }), part('b', { types: ['w3', 'w2', 'd1', 'd2', 'w1'] }));
    expect(c.duplicates.map((d) => [d.key, d.elements.length])).toEqual([['w1', 3], ['w3', 0]]);
  });

  it('is said in the readiness list, with the schedule, the parts and the types', () => {
    const c = check(part('windows', { kinds: ['window'] }), part('doors', { kinds: ['door'] }), part('pick', { types: ['w2'] }));
    // The doors part is not one of the parts that share a window.
    const [f] = modelReadiness(COMPLETE, [c]);
    expect([f.kind, f.params]).toEqual(['subReportDuplicates', { schedule: 'Joinery', types: 1, count: 1, list: 'W2 Fixed window ×1 (Ground)', parts: 'Windows, Pick' }]);
    expect(describeReadiness(f).missing).toBe('In "Joinery", more than one part lists the same type or element (Windows, Pick). Types: 1, elements: 1: W2 Fixed window ×1 (Ground).');
  });
});

describe('a gap', () => {
  it('names the exact missing elements and types', () => {
    const c = check(part('doors', { types: ['d1'] }), part('windows', { kinds: ['window'] }));
    expect(c.duplicates).toEqual([]);
    expect(c.gaps).toEqual([{ key: 'd2', label: 'D2 Fire door', levels: ['Level 1'], elements: [{ globalId: 'g9', mark: 'D2.1', level: 'Level 1' }] }]);
  });

  it('names the elements of a storey no part keeps, type by type', () => {
    const c = check(part('ground', { levels: ['Ground'] }));
    expect(c.gaps.map((g) => [g.key, g.elements.map((e) => e.globalId)])).toEqual([['w1', ['g3']], ['d1', ['g7', 'g8']], ['d2', ['g9']]]);
    expect(c.gaps.every((g) => g.elements.every((e) => e.level === 'Level 1'))).toBe(true);
  });

  it('is said in the readiness list', () => {
    const c = check(part('doors', { types: ['d1'] }), part('windows', { kinds: ['window'] }));
    const [f] = modelReadiness(COMPLETE, [c]);
    expect([f.kind, f.params]).toEqual(['subReportGaps', { schedule: 'Joinery', types: 1, count: 1, list: 'D2 Fire door ×1 (Level 1)' }]);
    expect(describeReadiness(f).missing).toBe('In "Joinery", some elements are in no part. Types: 1, elements: 1: D2 Fire door ×1 (Level 1).');
  });
});

describe('the one-click fixes', () => {
  const applied = (c: SubReportCheck, parts: CheckPart[], i = 0) => {
    const edits = c.fixes[i].edits;
    return checkSubReports(parent, parts.map((p) => ({ ...p, filter: edits.find((e) => e.partId === p.id)?.filter ?? p.filter })));
  };

  it('adds the missing type to the part that picks types by hand, and the check is then clean', () => {
    const parts = [part('doors', { types: ['d1'] }), part('windows', { kinds: ['window'] })];
    const c = checkSubReports(parent, parts);
    expect(c.fixes).toEqual([{ kind: 'add', part: { id: 'doors', name: 'Doors' }, types: 1, edits: [{ partId: 'doors', filter: { types: ['d1', 'd2'] } }] }]);
    expect(isClean(applied(c, parts))).toBe(true);
  });

  it('adds a missing storey to the part that is cut by storey', () => {
    const parts = [part('ground', { levels: ['Ground'] })];
    const c = checkSubReports(parent, parts);
    expect(c.fixes.map((f) => [f.kind, f.part.id, f.edits[0].filter])).toEqual([['add', 'ground', { levels: ['Ground', 'Level 1'] }]]);
    expect(isClean(applied(c, parts))).toBe(true);
  });

  it('keeps a duplicated type in the first part that lists it and takes it out of the others', () => {
    const parts = [part('windows', { kinds: ['window'] }), part('doors', { kinds: ['door'] }), part('pick', { types: ['w2'] })];
    const c = checkSubReports(parent, parts);
    expect(c.fixes).toEqual([{ kind: 'keep', part: { id: 'windows', name: 'Windows' }, types: 1, edits: [{ partId: 'pick', filter: { types: [] } }] }]);
    expect(isClean(applied(c, parts))).toBe(true);
  });

  it('does not offer a fix that would open a gap: it tries each part as the keeper and takes the one that works', () => {
    // Part A holds the Ground storey, B picks w1 (all storeys). w1 on Ground is twice. Taking w1 out of B would leave w1 on Level 1 in no part.
    const parts = [part('a', { levels: ['Ground'] }), part('b', { types: ['w1'] }), part('rest', { levels: ['Level 1'], kinds: ['door'] })];
    const c = checkSubReports(parent, parts);
    const keep = c.fixes.find((f) => f.kind === 'keep')!;
    expect(keep.part.id).toBe('b');
    expect(keep.edits.map((e) => e.partId)).toEqual(['a']);
    expect(applied(c, parts, c.fixes.indexOf(keep)).duplicates).toEqual([]);
  });

  it('does not offer to add what would put elements in two parts', () => {
    // Doors, and Level 1: the doors of Level 1 are in both, the windows of Ground are in none.
    // Widening either part to take the Ground windows would add more repeats, so only the keep fix is offered.
    const c = check(part('a', { kinds: ['door'] }), part('b', { levels: ['Level 1'] }));
    expect(c.gaps.map((g) => g.key)).toEqual(['w1', 'w2']);
    expect(c.fixes.map((f) => f.kind)).toEqual(['keep']);
  });

  it('offers nothing for a clean check', () => {
    expect(check(part('x', {}), part('y', { levels: [] })).fixes).toEqual([]);
  });
});

/** doors + windows are a partition; `extra` lists the four D1 doors again: the one overlap, and no gap. */
const overlapping = (): CheckPart[] => [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'] }), part('extra', { types: ['d1'] })];

describe('the review list: each element with the parts that list it', () => {
  it('names every element once, in the schedule\'s order, with the exact parts and status (a type with no element yet is one row)', () => {
    const c = checkSubReports(parent, overlapping());
    // Written out by hand from the fixture: w1 g1-g3, w2 g4, d1 g5-g8 (listed by doors and extra), d2 g9, w3 has no element.
    expect(c.elements.map((e) => [e.id, e.element?.mark ?? null, e.element?.level ?? null, e.parts.map((p) => p.id), e.status])).toEqual([
      ['w1|g1', 'W1.1', 'Ground', ['windows'], 'ok'],
      ['w1|g2', 'W1.2', 'Ground', ['windows'], 'ok'],
      ['w1|g3', 'W1.3', 'Level 1', ['windows'], 'ok'],
      ['w2|g4', 'W2.1', 'Ground', ['windows'], 'ok'],
      ['d1|g5', 'D1.1', 'Ground', ['doors', 'extra'], 'duplicate'],
      ['d1|g6', 'D1.2', 'Ground', ['doors', 'extra'], 'duplicate'],
      ['d1|g7', 'D1.3', 'Level 1', ['doors', 'extra'], 'duplicate'],
      ['d1|g8', 'D1.4', 'Level 1', ['doors', 'extra'], 'duplicate'],
      ['d2|g9', 'D2.1', 'Level 1', ['doors'], 'ok'],
      ['w3|', null, null, ['windows'], 'ok'],
    ]);
  });

  it('flags a gap row for an element in no part', () => {
    const c = checkSubReports(parent, [part('doors', { types: ['d1'] }), part('windows', { kinds: ['window'] })]);
    expect(c.elements.filter((e) => e.status === 'gap').map((e) => [e.id, e.parts])).toEqual([['d2|g9', []]]);
  });

  it('lists nothing while there are no parts', () => {
    expect(check().elements).toEqual([]);
  });

  it('agrees with the duplicates and gaps it sits beside, for every kind of split', () => {
    const splits = [overlapping(), [part('a', { levels: ['Ground'] })], [part('a', { kinds: ['door'] }), part('b', { levels: ['Level 1'] })], [part('x', {}), part('y', {})]];
    for (const parts of splits) {
      const c = checkSubReports(parent, parts);
      const ids = (list: { elements: { globalId: string }[]; key: string }[]) => list.flatMap((t) => t.elements.map((e) => keepId(t.key, e.globalId))).sort();
      expect(c.elements.filter((e) => e.status === 'duplicate' && e.element).map((e) => e.id).sort()).toEqual(ids(c.duplicates));
      expect(c.elements.filter((e) => e.status === 'gap').map((e) => e.id).sort()).toEqual(ids(c.gaps));
    }
  });
});

describe('keeping elements apart on purpose', () => {
  const D1 = ['d1|g5', 'd1|g6', 'd1|g7', 'd1|g8'];

  it('stops flagging the elements named, and says "kept" for them', () => {
    const c = checkSubReports(parent, overlapping(), undefined, D1);
    expect(c.duplicates).toEqual([]);
    expect(c.fixes).toEqual([]);
    expect(isClean(c)).toBe(true);
    expect(c.elements.filter((e) => e.status === 'kept').map((e) => e.id)).toEqual(D1);
    expect(modelReadiness(COMPLETE, [c])).toEqual([]);
  });

  it('keeps flagging the elements that were not named', () => {
    const c = checkSubReports(parent, overlapping(), undefined, ['d1|g5', 'd1|g6']);
    expect(c.duplicates.map((d) => [d.key, d.elements.map((e) => e.globalId)])).toEqual([['d1', ['g7', 'g8']]]);
    expect(c.elements.filter((e) => e.status === 'kept').map((e) => e.id)).toEqual(['d1|g5', 'd1|g6']);
  });

  it('takes the id of a type to mean all of its elements, and a type with no element yet', () => {
    expect(isClean(checkSubReports(parent, overlapping(), undefined, ['d1|']))).toBe(true);
    const c = checkSubReports(parent, [part('a', { types: ['w3', 'w1'] }), part('b', { types: ['w3', 'w2', 'd1', 'd2', 'w1'] })], undefined, ['w3|']);
    expect(c.duplicates.map((d) => d.key)).toEqual(['w1']);
  });

  it('does not hide a gap: a kept-apart id names a duplicate, it does not excuse an element nobody lists', () => {
    const c = checkSubReports(parent, [part('doors', { types: ['d1'] }), part('windows', { kinds: ['window'] })], undefined, ['d2|g9', 'd2|']);
    expect(c.gaps.map((g) => g.key)).toEqual(['d2']);
  });

  it('counts the kept elements as kept when it simulates a fix, so a fix that moves only unkept ones is still offered', () => {
    const parts = [part('windows', { kinds: ['window'] }), part('doors', { kinds: ['door'] }), part('pick', { types: ['w2', 'd2'] })];
    const c = checkSubReports(parent, parts, undefined, ['d2|']);
    expect(c.duplicates.map((d) => d.key)).toEqual(['w2']);
    expect(c.fixes.map((f) => f.kind)).toEqual(['keep']);
  });
});
