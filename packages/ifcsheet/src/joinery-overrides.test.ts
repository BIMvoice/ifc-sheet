/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Typed cells of a joinery schedule (#446), on AC20-FZK-Haus: its eleven windows are listed as types by size (`untyped:window:<w>×<h>`), the
 * key a type has when the model gives it no IfcTypeObject of the project's. The expectations are written from the IFC text: the file has windows
 * of two sizes, 1200×2000 and the others, named EG-Fenster-n.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { openModel } from './headless.js';
import { joineryScheduleData, type ScheduleData } from './joinery-schedule.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import {
  clearJoineryOverride, dropJoineryOverrides, joineryCellText, orphanedJoineryOverrides, readJoineryOverrides, setJoineryOverride, typeIdentityOf, type JoineryCellOverride,
} from './joinery-overrides.js';
import { readProjectFile } from './project-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';
import { scheduleOf, type ProjectSchedule } from './sub-reports.js';

const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
const SCHEDULE: ProjectSchedule = { id: 's', name: 'Windows', kind: 'window', createdAt: 1 };

let windows: ScheduleData;
beforeAll(async () => {
  const model = await openModel(new Uint8Array(readFileSync(FZK)), { geometry: false });
  windows = joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null }], project, 'window');
}, 60_000);

describe('a typed cell of a joinery schedule (#446)', () => {
  it('belongs to the type of the cell, in every schedule that lists it, and to no other type', () => {
    const [first, other] = windows.entries;
    expect(windows.entries.length).toBeGreaterThan(1);
    const overrides = setJoineryOverride(undefined, first, 'fire', 'EI 30', 'first');
    expect(overrides).toEqual([{ type: first.key, row: 'fire', value: 'EI 30', about: 'first' }]);
    // The data of a schedule, and of a part of it, carries the project's cells; the cell of the type prints them.
    const whole = scheduleOf([SCHEDULE], SCHEDULE, windows, overrides);
    const part = scheduleOf([SCHEDULE, { ...SCHEDULE, id: 'p', sub: { parent: 's', filter: { types: [first.key] } } }], { id: 'p', sub: { parent: 's', filter: { types: [first.key] } } }, windows, overrides);
    for (const data of [whole, part]) {
      const entry = data.entries.find((e) => e.key === first.key)!;
      expect(joineryCellText(data.overrides, entry, 'fire', '—')).toBe('EI 30');
      expect(joineryCellText(data.overrides, entry, 'u', '1.4')).toBe('1.4');
    }
    expect(joineryCellText(whole.overrides, other, 'fire', '—')).toBe('—');
    expect(scheduleOf([SCHEDULE], SCHEDULE, windows)).toBe(windows);
  });

  it('is found by the IfcTypeObject GlobalId or by the entry key, and a set replaces the cell whichever it was saved under', () => {
    const entry = { ...windows.entries[0], typeGlobalId: '3vB2YO$MX4xv5uCqZ$G0aR' };
    expect(typeIdentityOf(entry)).toBe('3vB2YO$MX4xv5uCqZ$G0aR');
    const byKey: JoineryCellOverride[] = [{ type: entry.key, row: 'name', value: 'by key', about: '' }];
    expect(joineryCellText(byKey, entry, 'name', 'model')).toBe('by key');
    const replaced = setJoineryOverride(byKey, entry, 'name', 'by id', 'x');
    expect(replaced).toEqual([{ type: '3vB2YO$MX4xv5uCqZ$G0aR', row: 'name', value: 'by id', about: 'x' }]);
    expect(clearJoineryOverride(byKey, entry, 'name')).toEqual([]);
    // Typed under the IfcTypeObject, then read for an entry that has none: it is another type's.
    expect(joineryCellText(replaced, windows.entries[0], 'name', 'model')).toBe('model');
  });

  it('is empty text when the value is empty, and refuses a row the schedule has not', () => {
    const entry = windows.entries[0];
    expect(joineryCellText(setJoineryOverride(undefined, entry, 'u', '', ''), entry, 'u', '1.4')).toBe('');
    expect(setJoineryOverride(undefined, entry, 'bogus', '9', '')).toEqual([]);
  });

  it('is read back from a file: a damaged one or an unknown row dropped, a repeat of a cell kept once', () => {
    expect(readJoineryOverrides([
      { type: 'A', row: 'fire', value: 'one', about: 'a' }, { type: 'A', row: 'fire', value: 'two' }, { type: 'A', row: 'bogus', value: '9' },
      { type: '', row: 'fire', value: 'x' }, { type: 'B', row: 'fire' }, 7,
    ])).toEqual([{ type: 'A', row: 'fire', value: 'two', about: '' }]);
    expect(readJoineryOverrides([])).toBeUndefined();
    expect(readJoineryOverrides('x')).toBeUndefined();
  });

  it('survives a save: the engine reads the project file, and the data it prints carries the same cell', () => {
    const entry = windows.entries[1];
    const overrides = setJoineryOverride(undefined, entry, 'fire', 'EI 60', 'second');
    const text = JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'House', schedules: [SCHEDULE], joineryOverrides: overrides });
    const facts = readProjectFile(text);
    expect(facts.joineryOverrides).toEqual(overrides);
    const data = scheduleOf(facts.schedules, SCHEDULE, windows, facts.joineryOverrides);
    expect(windows.entries.map((e) => joineryCellText(data.overrides, e, 'fire', '—'))).toEqual(windows.entries.map((e) => (e.key === entry.key ? 'EI 60' : '—')));
    expect(readProjectFile(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'House' })).joineryOverrides).toBeUndefined();
  });

  it('is reported when its type is no longer listed, once per type, and dropping it keeps the others', () => {
    const [a, b] = windows.entries;
    let o = setJoineryOverride(undefined, a, 'fire', 'x', 'type A');
    o = setJoineryOverride(o, a, 'name', 'y', 'type A');
    o = setJoineryOverride(o, b, 'fire', 'z', 'type B');
    expect(orphanedJoineryOverrides(o, windows.entries)).toEqual([]);
    const later = windows.entries.filter((e) => e.key !== a.key);
    expect(orphanedJoineryOverrides(o, later)).toEqual([{ type: a.key, about: 'type A', count: 2 }]);
    expect(dropJoineryOverrides(o, [a.key]).map((x) => x.type)).toEqual([b.key]);
  });
});
