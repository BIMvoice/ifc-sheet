/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The manual check of a split schedule (#186, section 2): the list by type, its filters, and the edits merge / move / keep apart make. */

import { describe, expect, it } from 'vitest';
import { checkSubReports, keepId, occurrenceMarkOf, subReportCheckOf, type CheckEntry, type CheckPart } from './sub-report-check.js';
import { filterReview, keepApart, placeTypes, placeTypesOf, resumeChecking, reviewCounts, reviewTypes } from './sub-report-review.js';
import type { ContentEntry } from './schedule-content.js';
import { readSchedule, scheduleOf, subReportData, type ProjectSchedule, type SplitData } from './sub-reports.js';

const occ = (globalId: string, level: string, number: number) => ({ level, globalId, number, modelId: 'm', expressId: Number(globalId.replace(/\D/g, '')) });
const entry = (key: string, kind: 'door' | 'window', mark: string, name: string, occurrences: CheckEntry['occurrences']): CheckEntry => {
  const counts: Record<string, number> = {};
  for (const o of occurrences) counts[o.level] = (counts[o.level] ?? 0) + 1;
  return { key, kind, mark, name, counts, total: occurrences.length, occurrences };
};
const house = (): SplitData<CheckEntry> => ({
  levels: ['Ground', 'Level 1'],
  entries: [
    entry('w1', 'window', 'W1', 'Window', [occ('g1', 'Ground', 1), occ('g2', 'Ground', 2), occ('g3', 'Level 1', 3)]),
    entry('w2', 'window', 'W2', 'Fixed window', [occ('g4', 'Ground', 1)]),
    entry('d1', 'door', 'D1', 'Door', [occ('g5', 'Ground', 1), occ('g6', 'Ground', 2), occ('g7', 'Level 1', 3), occ('g8', 'Level 1', 4)]),
    entry('d2', 'door', 'D2', 'Fire door', [occ('g9', 'Level 1', 1)]),
    entry('w3', 'window', 'W3', 'Skylight', []),
  ],
});
const data = house();
const part = (id: string, filter: CheckPart['filter']): CheckPart => ({ id, name: id[0].toUpperCase() + id.slice(1), filter });
const check = (parts: CheckPart[], kept: string[] = []) => checkSubReports({ id: 'joinery', name: 'Joinery', data }, parts, undefined, kept);
/** Apply edits to the parts, the way the app writes them to the sub-reports. */
const apply = (parts: CheckPart[], edits: { partId: string; filter: CheckPart['filter'] }[]) => parts.map((p) => ({ ...p, filter: edits.find((e) => e.partId === p.id)?.filter ?? p.filter }));

describe('the list by type', () => {
  const parts = [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'] }), part('extra', { types: ['d1', 'w2'] })];

  it('shows each type with the parts it appears in, its storeys, and the worst status of its elements', () => {
    const types = reviewTypes(check(parts));
    expect(types.map((t) => [t.key, t.parts.map((p) => p.id), t.levels, t.status, t.elements.length])).toEqual([
      ['w1', ['windows'], ['Ground', 'Level 1'], 'ok', 3],
      ['w2', ['windows', 'extra'], ['Ground'], 'duplicate', 1],
      ['d1', ['doors', 'extra'], ['Ground', 'Level 1'], 'duplicate', 4],
      ['d2', ['doors'], ['Level 1'], 'ok', 1],
      ['w3', ['windows'], [], 'ok', 1],
    ]);
  });

  it('orders the parts of a type as the parts are ordered, not as its elements name them', () => {
    const t = reviewTypes(check([part('b', { levels: ['Level 1'] }), part('a', { levels: ['Ground', 'Level 1'] })])).find((x) => x.key === 'w1')!;
    expect(t.parts.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('puts a duplicate before a gap before a kept-apart type in the status of a type', () => {
    const t = reviewTypes(check([part('a', { levels: ['Ground'] }), part('b', { types: ['w1'] })], ['w1|g1'])).find((x) => x.key === 'w1')!;
    // g1 kept, g2 a duplicate (Ground in a and in b), g3 only in b.
    expect(t.elements.map((e) => e.status)).toEqual(['kept', 'duplicate', 'ok']);
    expect(t.status).toBe('duplicate');
  });

  it('filters by kind, by storey and by status; the type keeps only the elements that match', () => {
    const types = reviewTypes(check(parts));
    expect(filterReview(types, { kind: 'door' }).map((t) => t.key)).toEqual(['d1', 'd2']);
    expect(filterReview(types, { level: 'Level 1' }).map((t) => [t.key, t.elements.map((e) => e.id)])).toEqual([['w1', ['w1|g3']], ['d1', ['d1|g7', 'd1|g8']], ['d2', ['d2|g9']]]);
    expect(filterReview(types, { status: 'duplicate' }).map((t) => [t.key, t.elements.length])).toEqual([['w2', 1], ['d1', 4]]);
    expect(filterReview(types, { status: 'gap' })).toEqual([]);
    expect(filterReview(types, { kind: 'door', level: 'Ground', status: 'duplicate' }).map((t) => [t.key, t.elements.map((e) => e.id)])).toEqual([['d1', ['d1|g5', 'd1|g6']]]);
    expect(filterReview(types, {})).toEqual(types);
  });

  it('counts the elements by status', () => {
    expect(reviewCounts(check(parts))).toEqual({ duplicate: 5, kept: 0, gap: 0, ok: 5 });
    expect(reviewCounts(check(parts, ['d1|']))).toEqual({ duplicate: 1, kept: 4, gap: 0, ok: 5 });
  });
});

describe('merge, move and keep apart', () => {
  it('merge: lists the type in the chosen part only; the filters are exactly these', () => {
    const parts = [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'] }), part('extra', { types: ['d1'] })];
    expect(placeTypes(data, parts, ['d1'], 'doors')).toEqual([{ partId: 'extra', filter: { types: [] } }]);
    expect(placeTypes(data, parts, ['d1'], 'extra')).toEqual([{ partId: 'doors', filter: { kinds: ['door'], types: ['d2'] } }]);
    for (const into of ['doors', 'extra']) {
      const after = check(apply(parts, placeTypes(data, parts, ['d1'], into)));
      expect(after.duplicates).toEqual([]);
      expect(after.gaps).toEqual([]);
      expect(after.elements.filter((e) => e.key === 'd1').every((e) => e.parts.length === 1 && e.parts[0].id === into)).toBe(true);
    }
  });

  it('move: takes a type that nobody duplicates to another part, and the other parts are otherwise untouched', () => {
    const parts = [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'], types: ['w1', 'w2', 'w3'] })];
    const edits = placeTypes(data, parts, ['w2'], 'doors');
    // Windows loses w2; doors names no types, so it is widened by the window kind. That is the reach of a move between parts cut by kind: the review shows what is left.
    expect(edits.map((e) => e.partId)).toEqual(['windows', 'doors']);
    expect(edits[0].filter).toEqual({ kinds: ['window'], types: ['w1', 'w3'] });
  });

  it('move to a part that picks types by hand adds exactly that type', () => {
    const parts = [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'] }), part('pick', { types: ['d2'] })];
    const edits = placeTypes(data, parts, ['w2'], 'pick');
    expect(edits).toEqual([
      { partId: 'windows', filter: { kinds: ['window'], types: ['w1', 'w3'] } },
      { partId: 'pick', filter: { types: ['d2', 'w2'] } },
    ]);
    const after = check(apply(parts, edits));
    expect(after.elements.find((e) => e.id === 'w2|g4')!.parts.map((p) => p.id)).toEqual(['pick']);
    expect(after.gaps).toEqual([]);
  });

  it('move fills a gap: a type nobody lists joins the part and the check is clean', () => {
    const parts = [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'], types: ['w1', 'w3'] })];
    expect(check(parts).gaps.map((g) => g.key)).toEqual(['w2']);
    const edits = placeTypes(data, parts, ['w2'], 'windows');
    expect(edits).toEqual([{ partId: 'windows', filter: { kinds: ['window'], types: ['w1', 'w3', 'w2'] } }]);
    expect(check(apply(parts, edits)).gaps).toEqual([]);
  });

  it('moving to the part it is already alone in changes nothing', () => {
    const parts = [part('doors', { kinds: ['door'] }), part('windows', { kinds: ['window'] })];
    expect(placeTypes(data, parts, ['d1'], 'doors')).toEqual([]);
    expect(placeTypes(data, parts, ['d1'], 'nowhere')).toEqual([]);
    expect(placeTypes(data, parts, [], 'doors')).toEqual([]);
  });

  it('keep apart: the kept ids are added once, bounded, and taken out again', () => {
    expect(keepApart(undefined, ['d1|'])).toEqual(['d1|']);
    expect(keepApart(['d1|'], ['d1|', keepId('w2', 'g4')])).toEqual(['d1|', 'w2|g4']);
    expect(resumeChecking(['d1|', 'w2|g4'], ['d1|'])).toEqual(['w2|g4']);
    expect(resumeChecking(['d1|'], ['d1|'])).toBeUndefined();
  });
});

describe('read from the project the way the sheet prints it', () => {
  const schedules: ProjectSchedule[] = [
    { id: 'joinery', name: 'Joinery', kind: 'all', createdAt: 1, content: { numbering: { scheme: 'sequence' } } as ProjectSchedule['content'] },
    { id: 'p1', name: 'Doors', kind: 'all', createdAt: 1, sub: { parent: 'joinery', filter: { kinds: ['door'] } } },
    { id: 'p2', name: 'Windows', kind: 'all', createdAt: 1, sub: { parent: 'joinery', filter: { kinds: ['window'] } } },
    { id: 'p3', name: 'Extra', kind: 'all', createdAt: 1, sub: { parent: 'joinery', filter: { types: ['d1'] } } },
  ];
  const read = (): SplitData<CheckEntry & ContentEntry> => house() as unknown as SplitData<CheckEntry & ContentEntry>;

  it('names each element by the mark the parts print (the schedule\'s numbering applies before the cut)', () => {
    const c = subReportCheckOf(schedules[0], schedules, read);
    for (const p of schedules.slice(1)) {
      const printed = scheduleOf(schedules, p, read()).entries.flatMap((e) => e.occurrences.map((o) => [`${e.key}|${o.globalId}`, occurrenceMarkOf(e, o)]));
      const listed = c.elements.filter((e) => e.element && e.parts.some((x) => x.id === p.id)).map((e) => [e.id, e.element!.mark]);
      expect(listed.sort()).toEqual(printed.sort());
    }
  });

  it('honours the schedule\'s kept-apart list', () => {
    expect(subReportCheckOf(schedules[0], schedules, read).duplicates.map((d) => d.key)).toEqual(['d1']);
    const kept = schedules.map((s) => (s.id === 'joinery' ? { ...s, keptApart: ['d1|'] } : s));
    expect(subReportCheckOf(kept[0], kept, read).duplicates).toEqual([]);
  });

  it('placeTypesOf reads the same rows as the check', () => {
    const edits = placeTypesOf(schedules[0], schedules, read, ['d1'], 'p1');
    expect(edits).toEqual([{ partId: 'p3', filter: { types: [] } }]);
    expect(subReportData(house(), edits[0].filter).entries).toEqual([]);
  });
});

describe('what is saved', () => {
  const base = { id: 's1', name: 'Joinery', kind: 'all', createdAt: 1 };

  it('keeps the list on the schedule that was split', () => {
    expect(readSchedule({ ...base, keptApart: ['d1|', 'w2|g4'] })?.keptApart).toEqual(['d1|', 'w2|g4']);
  });

  it('loads a project from before it unchanged: no list, no key', () => {
    const old = readSchedule(base)!;
    expect('keptApart' in old).toBe(false);
    expect(readSchedule({ ...base, keptApart: [] })).toEqual(old);
  });

  it('drops it from a part, from a schedule that cannot be split, and drops damaged entries and repeats', () => {
    expect('keptApart' in readSchedule({ ...base, sub: { parent: 's0', filter: {} }, keptApart: ['d1|'] })!).toBe(false);
    expect('keptApart' in readSchedule({ ...base, kind: 'materials', keptApart: ['d1|'] })!).toBe(false);
    expect(readSchedule({ ...base, keptApart: ['a|', 'a|', 7, null, '', { x: 1 }, 'b|'] })?.keptApart).toEqual(['a|', 'b|']);
    expect('keptApart' in readSchedule({ ...base, keptApart: 'd1|' })!).toBe(false);
  });
});
