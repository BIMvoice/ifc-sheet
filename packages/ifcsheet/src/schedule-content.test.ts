/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import {
  applyContent, contentOf, followedTags, orderedRows, readScheduleContent, shownRows,
  type ContentEntry, type ScheduleContent,
} from './schedule-content.js';
import { occurrenceMarkOf } from './sub-report-check.js';
import { readSchedule, scheduleOf, type ProjectSchedule } from './sub-reports.js';

interface Entry extends ContentEntry {
  occurrences: { level: string; number: number; modelId: string; expressId: number; tag: string | null }[];
}

/** Type -> [kind, mark, width m, height m, count on Ground, count on Level 1], in the order the model's rows come: windows, then doors, by mark. */
const TYPES: [string, 'door' | 'window', string, number, number, number, number][] = [
  ['w1', 'window', 'W1', 1.2, 1.2, 2, 1],
  ['w2', 'window', 'W2', 0.9, 1.2, 1, 0],
  ['w3', 'window', 'W3', 1.5, 1.4, 3, 2],
  ['d1', 'door', 'D1', 0.9, 2.1, 4, 0],
  ['d2', 'door', 'D2', 1.0, 2.1, 0, 2],
];

/** Fresh every call: nothing may depend on a shared fixture being left alone. */
function fixture(): { entries: Entry[]; levels: string[] } {
  let id = 100;
  const entries = TYPES.map(([key, kind, mark, width, height, ground, first]): Entry => {
    const occurrences: Entry['occurrences'] = [];
    for (let i = 0; i < ground; i++) occurrences.push({ level: 'Ground', number: occurrences.length + 1, modelId: 'm', expressId: id++, tag: null });
    for (let i = 0; i < first; i++) occurrences.push({ level: 'Level 1', number: occurrences.length + 1, modelId: 'm', expressId: id++, tag: null });
    const counts: Record<string, number> = {};
    if (ground) counts.Ground = ground;
    if (first) counts['Level 1'] = first;
    return { key, kind, mark, name: kind === 'door' ? 'Door' : 'Window', width, height, counts, total: ground + first, occurrences };
  });
  return { entries, levels: ['Ground', 'Level 1'] };
}

const marks = (d: { entries: ContentEntry[] }) => d.entries.map((e) => e.mark);
const keys = (d: { entries: ContentEntry[] }) => d.entries.map((e) => e.key);
/** Every element's mark as the schedule prints it, type by type. */
const printed = (d: { entries: Entry[] }) => d.entries.map((e) => e.occurrences.map((o) => occurrenceMarkOf(e, o)));

describe('applyContent', () => {
  it('no content, or a content that chooses nothing, is the data itself (an old project is untouched)', () => {
    const data = fixture();
    expect(applyContent(data, undefined)).toBe(data);
    expect(applyContent(data, {})).toBe(data);
    expect(applyContent(data, { rows: { hidden: ['u'] } })).toBe(data);
  });

  it('is independent of the order the types arrive in only where a sort is chosen', () => {
    const data = fixture();
    expect(keys(applyContent(data, { sort: { by: 'count', descending: true } }))).toEqual(['w3', 'd1', 'w1', 'd2', 'w2']);
  });

  it.each<[string, ScheduleContent['sort'], string[]]>([
    ['size, narrowest then lowest first', { by: 'size' }, ['w2', 'd1', 'd2', 'w1', 'w3']],
    ['size, widest first', { by: 'size', descending: true }, ['w3', 'w1', 'd2', 'd1', 'w2']],
    ['count, fewest first', { by: 'count' }, ['w2', 'd2', 'w1', 'd1', 'w3']],
    ['count, most first', { by: 'count', descending: true }, ['w3', 'd1', 'w1', 'd2', 'w2']],
    ['kind, windows then doors, each in its own order', { by: 'kind' }, ['w1', 'w2', 'w3', 'd1', 'd2']],
    ['kind, doors first', { by: 'kind', descending: true }, ['d1', 'd2', 'w1', 'w2', 'w3']],
    ['mark, doors before windows as the letters fall', { by: 'mark' }, ['d1', 'd2', 'w1', 'w2', 'w3']],
    ['mark, backwards', { by: 'mark', descending: true }, ['w3', 'w2', 'w1', 'd2', 'd1']],
  ])('sorts by %s', (_, sort, expected) => {
    expect(keys(applyContent(fixture(), { sort }))).toEqual(expected);
  });

  it('puts W2 before W10 by number, not by letter', () => {
    const data = fixture();
    data.entries[1].mark = 'W10';
    data.entries[0].mark = 'W9';
    expect(marks(applyContent(data, { sort: { by: 'mark' } }))).toEqual(['D1', 'D2', 'W3', 'W9', 'W10']);
  });

  it('keeps the model order among equal keys', () => {
    const data = fixture();
    for (const e of data.entries) e.total = 1;
    expect(keys(applyContent(data, { sort: { by: 'count', descending: true } }))).toEqual(keys(data));
  });

  it('numbers the types in the order shown: a letter per kind, from the chosen start', () => {
    const out = applyContent(fixture(), { sort: { by: 'count', descending: true }, numbering: { marks: 'sequence', typeStart: 5 } });
    expect(keys(out)).toEqual(['w3', 'd1', 'w1', 'd2', 'w2']);
    expect(marks(out)).toEqual(['W5', 'D5', 'W6', 'D6', 'W7']);
  });

  it('starts the elements of a type at the chosen number, level by level', () => {
    const out = applyContent(fixture(), { numbering: { elementStart: 10 } });
    expect(marks(out)).toEqual(['W1', 'W2', 'W3', 'D1', 'D2']);
    expect(printed(out)).toEqual([
      ['W1.10', 'W1.11', 'W1.12'], ['W2.10'], ['W3.10', 'W3.11', 'W3.12', 'W3.13', 'W3.14'], ['D1.10', 'D1.11', 'D1.12', 'D1.13'], ['D2.10', 'D2.11'],
    ]);
  });

  it('keeps the catalogue marks under the default scheme, whatever the sort', () => {
    expect(marks(applyContent(fixture(), { sort: { by: 'size' } }))).toEqual(['W2', 'D1', 'D2', 'W1', 'W3']);
  });

  it('does not touch what it is given', () => {
    const data = fixture();
    const before = JSON.stringify(data);
    applyContent(data, { sort: { by: 'count' }, numbering: { marks: 'sequence', typeStart: 3, elementStart: 7 } });
    expect(JSON.stringify(data)).toBe(before);
  });

  it('is idempotent: applying a choice to what it produced changes nothing', () => {
    const content: ScheduleContent = { sort: { by: 'size', descending: true }, numbering: { marks: 'sequence', typeStart: 2, elementStart: 4 } };
    const once = applyContent(fixture(), content);
    expect(applyContent(once, content)).toEqual(once);
  });
});

describe('rows', () => {
  const ALL = ['name', 'size', 'operation', 'sill', 'levels', 'total', 'u', 'fire'];

  it('lists the model rows then the text rows by default, and shows all of them', () => {
    expect(orderedRows(undefined, ['a', 'b']).map((r) => r.id)).toEqual([...ALL, 'text:a', 'text:b']);
    expect(orderedRows(undefined, []).every((r) => r.shown)).toBe(true);
    expect(shownRows(undefined, { windows: true, textIds: ['a'] })).toEqual([...ALL, 'text:a']);
  });

  it('drops the sill row where there is no window, as before', () => {
    expect(shownRows(undefined, { windows: false, textIds: [] })).toEqual(ALL.filter((r) => r !== 'sill'));
  });

  it('hides and reorders', () => {
    const content: ScheduleContent = { rows: { order: ['total', 'name', 'size'], hidden: ['u', 'operation'] } };
    expect(shownRows(content, { windows: true, textIds: [] })).toEqual(['total', 'name', 'size', 'sill', 'levels', 'fire']);
    expect(orderedRows(content, []).map((r) => `${r.id}${r.shown ? '' : '-'}`)).toEqual(['total', 'name', 'size', 'operation-', 'sill', 'levels', 'u-', 'fire']);
  });

  it('puts a text row added after the choice was made at the end, shown; a hidden one stays hidden', () => {
    const content: ScheduleContent = { rows: { order: ['size', 'name'], hidden: ['text:gone'] } };
    expect(shownRows(content, { windows: true, textIds: ['gone', 'new'] })).toEqual(['size', 'name', 'operation', 'sill', 'levels', 'total', 'u', 'fire', 'text:new']);
  });

  it('ignores ids it does not know and repeats', () => {
    const content: ScheduleContent = { rows: { order: ['size', 'size', 'nope', 'text:zzz'], hidden: ['nope'] } };
    expect(shownRows(content, { windows: true, textIds: [] }).slice(0, 2)).toEqual(['size', 'name']);
    expect(shownRows(content, { windows: true, textIds: [] })).toHaveLength(ALL.length);
  });
});

describe('readScheduleContent', () => {
  it('reads nothing, or nothing useful, as no choice', () => {
    for (const raw of [undefined, null, 'x', 3, [], {}, { sort: {} }, { sort: { by: 'colour' } }, { numbering: {} }, { rows: {} }, { rows: { order: [], hidden: [] } }]) expect(readScheduleContent(raw)).toBeUndefined();
  });

  it('keeps a saved choice as it is', () => {
    const content: ScheduleContent = { rows: { order: ['size', 'name'], hidden: ['u', 'text:a'] }, sort: { by: 'count', descending: true }, numbering: { marks: 'sequence', typeStart: 3, elementStart: 0 } };
    expect(readScheduleContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
  });

  it('drops what is damaged, field by field', () => {
    expect(readScheduleContent({ rows: { order: ['size', 7, 'size'], hidden: 'u' }, sort: { by: 'size', descending: 'yes' }, numbering: { marks: 'letters', typeStart: -4, elementStart: 2.5 } }))
      .toEqual({ rows: { order: ['size'] }, sort: { by: 'size' } });
    expect(readScheduleContent({ numbering: { typeStart: 3, elementStart: 99999999 } })).toEqual({ numbering: { typeStart: 3 } });
  });
});

describe('readSchedule keeps the choice', () => {
  const base = { id: 's', name: 'Joinery', kind: 'all', createdAt: 1 };
  const content = { sort: { by: 'size' }, numbering: { elementStart: 4 } };

  it('on a joinery schedule, and not on any other kind', () => {
    expect(readSchedule({ ...base, content })?.content).toEqual(content);
    expect(readSchedule({ ...base, kind: 'materials', content })?.content).toBeUndefined();
  });

  it('a schedule saved before the choice has none', () => {
    expect(readSchedule(base)).toEqual({ id: 's', name: 'Joinery', kind: 'all', createdAt: 1 });
    expect('content' in readSchedule({ ...base, content: {} })!).toBe(false);
  });
});

describe('contentOf and scheduleOf', () => {
  const content: ScheduleContent = { sort: { by: 'count', descending: true }, numbering: { marks: 'sequence', typeStart: 1 }, rows: { hidden: ['u'] } };
  const parent: ProjectSchedule = { id: 'p', name: 'Joinery', kind: 'all', createdAt: 1, content };
  const doors: ProjectSchedule = { id: 'd', name: 'Doors', kind: 'all', createdAt: 2, sub: { parent: 'p', filter: { kinds: ['door'] } } };
  const windows: ProjectSchedule = { id: 'w', name: 'Windows', kind: 'all', createdAt: 3, sub: { parent: 'p', filter: { kinds: ['window'] } } };
  const schedules = [parent, doors, windows];

  it('a part uses its parent\'s choice, the parent its own', () => {
    expect(contentOf(schedules, parent)).toBe(content);
    expect(contentOf(schedules, doors)).toBe(content);
  });

  it('a part whose parent is gone uses its own', () => {
    const own: ScheduleContent = { sort: { by: 'size' } };
    expect(contentOf([{ ...doors, content: own }], { ...doors, content: own })).toBe(own);
    expect(contentOf([doors], doors)).toBeUndefined();
  });

  it('numbers the whole schedule, then cuts: a part carries the marks the whole has', () => {
    const whole = scheduleOf(schedules, parent, fixture());
    const d = scheduleOf(schedules, doors, fixture());
    const w = scheduleOf(schedules, windows, fixture());
    expect(marks(whole)).toEqual(['W1', 'D1', 'W2', 'D2', 'W3']);
    expect(keys(whole)).toEqual(['w3', 'd1', 'w1', 'd2', 'w2']);
    expect(marks(d)).toEqual(['D1', 'D2']);
    expect(marks(w)).toEqual(['W1', 'W2', 'W3']);
    // The same element carries the same mark in the whole and in its part.
    const markOfId = (x: { entries: Entry[] }) => new Map(x.entries.flatMap((e) => e.occurrences.map((o) => [o.expressId, occurrenceMarkOf(e, o)] as const)));
    const all = markOfId(whole);
    for (const part of [d, w]) for (const [id, mark] of markOfId(part)) expect(all.get(id)).toBe(mark);
  });

  it('hands the row choice on, with the text rows, so the layout needs nothing else', () => {
    expect(scheduleOf(schedules, doors, fixture()).content).toBe(content);
    expect(scheduleOf([{ ...parent, content: undefined }], { ...parent, content: undefined }, fixture()).content).toBeUndefined();
  });
});

describe('followedTags: plan tags follow the numbering', () => {
  const tagged = (tags: Record<number, string>) => {
    const d = fixture();
    for (const e of d.entries) for (const o of e.occurrences) o.tag = tags[o.expressId] ?? null;
    return d;
  };

  it('rewrites the tag of an element that carried its old mark, to its new one', () => {
    const before = fixture();
    const oldMarks = Object.fromEntries(before.entries.flatMap((e) => e.occurrences.map((o) => [o.expressId, occurrenceMarkOf(e, o)])));
    const model = tagged(oldMarks);
    const after = applyContent(model, { numbering: { elementStart: 10 } });
    const changes = followedTags(model, after);
    expect(changes).toHaveLength(15);
    expect(changes.find((c) => c.expressId === 100)).toEqual({ modelId: 'm', expressId: 100, tag: 'W1.10' });
    expect(changes.find((c) => c.expressId === 114)).toEqual({ modelId: 'm', expressId: 114, tag: 'D2.11' });
  });

  it('leaves a tag somebody else wrote, and an element with none, alone', () => {
    const model = tagged({ 100: 'FRONT-DOOR', 101: 'W1.2' });
    const after = applyContent(model, { numbering: { elementStart: 10 } });
    // 101 carried W1.2, which is the old mark of the element; 100 carried a name of the user's; the rest carried nothing.
    expect(followedTags(model, after)).toEqual([{ modelId: 'm', expressId: 101, tag: 'W1.11' }]);
  });

  it('says nothing when the marks did not change', () => {
    const model = tagged({ 100: 'W1.1' });
    expect(followedTags(model, applyContent(model, { sort: { by: 'size' } }))).toEqual([]);
  });
});
