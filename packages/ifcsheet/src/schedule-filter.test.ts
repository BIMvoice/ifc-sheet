/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Filters by IFC class, predefined type and property value, and the exterior / interior split (#186, section 3).
 *
 * Two files, with the expectations written out from the IFC text, not read back from the code under test:
 *  - `__fixtures__/exterior-interior.ifc`: eight openings on two storeys. IsExternal is true on A (Entrance), D (Front window), E (Roof light)
 *    and G (Balcony gate); false on B (Bedroom door), F (Borrowed light has no property set at all) and H (Office door); C (Store door) has a
 *    set without IsExternal. Neither AC20-FZK-Haus nor bloc-p4 carries IsExternal on a door or a window (bloc-p4 has no property sets; FZK
 *    has it on walls and stairs only), so the exterior / interior cases need this fixture.
 *  - AC20-FZK-Haus: its real Pset_DoorCommon / Pset_WindowCommon values (ThermalTransmittance 2 on the three inner doors, 1.4 on the entrance
 *    doors and all eleven windows; FireExit false on Innentuer-2; FireRating present but empty).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { openModel } from './headless.js';
import { joineryScheduleData, type ScheduleData } from './joinery-schedule.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { applyContent, readScheduleContent, symbolsShown } from './schedule-content.js';
import { EXTERIOR, INTERIOR, readSubReportFilter, type SubReportFilter } from './schedule-filter.js';
import { checkSubReports, isClean, subReportChecksOf } from './sub-report-check.js';
import { readSchedule, scheduleFilterProperties, scheduleOf, subReportData, type ProjectSchedule } from './sub-reports.js';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/exterior-interior.ifc', import.meta.url));
const FZK = fileURLToPath(new URL('../../../apps/viewer/src/test/__fixtures__/AC20-FZK-Haus.ifc', import.meta.url));
const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };

const rowsOf = async (file: string, names: string[] = []): Promise<ScheduleData> => {
  const model = await openModel(new Uint8Array(readFileSync(file)), { geometry: false });
  return joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null }], project, 'all', undefined, names);
};
/** The GlobalIds of the elements a data set lists, sorted. */
const ids = (data: ScheduleData): string[] => data.entries.flatMap((e) => e.occurrences.map((o) => o.globalId)).sort();
const guid = (...letters: string[]): string[] => letters.map((l) => `00000000000000000000${l}0`).sort();
const A = 'A', B = 'B', C = 'C', D = 'D', E = 'E', F = 'F', G = 'G', H = 'H';

let whole: ScheduleData;
beforeAll(async () => { whole = await rowsOf(FIXTURE, ['firerating']); }, 60_000);
const cut = (filter: SubReportFilter) => ids(subReportData(whole, filter));

describe('the rows carry what the filters read', () => {
  it('lists the eight openings with their class, predefined type and IsExternal', () => {
    expect(ids(whole)).toEqual(guid(A, B, C, D, E, F, G, H));
    const byId = new Map(whole.entries.flatMap((e) => e.occurrences).map((o) => [o.globalId, o]));
    const row = (l: string) => { const o = byId.get(`00000000000000000000${l}0`)!; return [o.ifcClass, o.predefinedType, (o.properties ?? []).filter((p) => p.name === 'IsExternal').map((p) => p.value)]; };
    expect(row(A)).toEqual(['IfcDoor', 'DOOR', ['true']]);
    expect(row(B)).toEqual(['IfcDoor', 'DOOR', ['false']]);
    expect(row(C)).toEqual(['IfcDoor', 'NOTDEFINED', []]);
    expect(row(E)).toEqual(['IfcWindow', 'SKYLIGHT', ['true']]);
    expect(row(F)).toEqual(['IfcWindow', 'WINDOW', []]);
    expect(row(G)).toEqual(['IfcDoor', 'GATE', ['true']]);
    expect(row(H)).toEqual(['IfcDoorStandardCase', 'DOOR', ['false']]);
  });
});

describe('the class filter', () => {
  it('keeps exactly the elements of the class', () => {
    expect(cut({ classes: ['IfcDoor'] })).toEqual(guid(A, B, C, G));
    expect(cut({ classes: ['IfcWindow'] })).toEqual(guid(D, E, F));
    expect(cut({ classes: ['IfcDoorStandardCase'] })).toEqual(guid(H));
    expect(cut({ classes: ['ifcdoor', 'IfcDoorStandardCase'] })).toEqual(guid(A, B, C, G, H));
  });
  it('keeps nothing for an empty list, and counts follow the elements', () => {
    expect(cut({ classes: [] })).toEqual([]);
    const doors = subReportData(whole, { classes: ['IfcDoor'] });
    expect(doors.entries.every((e) => e.total === e.occurrences.length && Object.values(e.counts).reduce((a, b) => a + b, 0) === e.total)).toBe(true);
    expect(doors.entries.every((e) => e.kind === 'door')).toBe(true);
  });
});

describe('the predefined type filter', () => {
  it('keeps exactly the elements with the type', () => {
    expect(cut({ predefined: ['GATE'] })).toEqual(guid(G));
    expect(cut({ predefined: ['NOTDEFINED'] })).toEqual(guid(C));
    expect(cut({ predefined: ['SKYLIGHT', 'GATE'] })).toEqual(guid(E, G));
    expect(cut({ predefined: ['DOOR'] })).toEqual(guid(A, B, H));
  });
});

describe('the property filter', () => {
  const test = (op: 'equals' | 'notEquals' | 'present', name: string, value?: string, pset?: string): SubReportFilter => ({ properties: [{ name, op, ...(value !== undefined ? { value } : {}), ...(pset ? { pset } : {}) }] });
  it('IsExternal = true keeps the four external elements', () => {
    expect(cut(test('equals', 'IsExternal', 'true'))).toEqual(guid(A, D, E, G));
  });
  it('IsExternal = false keeps only those that say false (an element without the property is not in it)', () => {
    expect(cut(test('equals', 'IsExternal', 'false'))).toEqual(guid(B, H));
  });
  it('IsExternal is not true keeps everything else, those without the property included', () => {
    expect(cut(test('notEquals', 'IsExternal', 'true'))).toEqual(guid(B, C, F, H));
  });
  it('present keeps those with a value; a blank FireRating is not present', () => {
    expect(cut(test('present', 'IsExternal'))).toEqual(guid(A, B, D, E, G, H));
    expect(cut(test('present', 'FireRating'))).toEqual(guid(A));
    expect(cut(test('equals', 'FireRating', 'ei30'))).toEqual(guid(A));
  });
  it('a set name narrows the property to that set', () => {
    expect(cut(test('equals', 'IsExternal', 'true', 'Pset_WindowCommon'))).toEqual(guid(D, E));
    expect(cut(test('equals', 'IsExternal', 'true', 'Pset_DoorCommon'))).toEqual(guid(A, G));
  });
  it('tests are all required, and combine with the class', () => {
    expect(cut({ classes: ['IfcDoor'], properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }, { name: 'FireRating', op: 'present' }] })).toEqual(guid(A));
    expect(cut({ classes: ['IfcWindow'], properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] })).toEqual(guid(D, E));
  });
  it('reads the names the filters of a project name, and no others', async () => {
    const only = await rowsOf(FIXTURE, ['firerating']);
    const names = new Set(only.entries.flatMap((e) => e.occurrences).flatMap((o) => (o.properties ?? []).map((p) => p.name)));
    expect([...names].sort()).toEqual(['FireRating', 'IsExternal']);
  });
});

describe('Exterior and interior apart', () => {
  it('Exterior is the four external elements, Interior the other four', () => {
    expect(cut(EXTERIOR)).toEqual(guid(A, D, E, G));
    expect(cut(INTERIOR)).toEqual(guid(B, C, F, H));
  });
  const schedules = (interior: SubReportFilter): ProjectSchedule[] => [
    { id: 's1', name: 'Joinery', kind: 'all', createdAt: 1 },
    { id: 's2', name: 'Exterior', kind: 'all', createdAt: 1, sub: { parent: 's1', filter: EXTERIOR } },
    { id: 's3', name: 'Interior', kind: 'all', createdAt: 1, sub: { parent: 's1', filter: interior } },
  ];
  it('is a partition: the duplicate and gap check is clean', () => {
    const checks = subReportChecksOf(schedules(INTERIOR), () => whole);
    expect(checks).toHaveLength(1);
    expect(checks[0].duplicates).toEqual([]);
    expect(checks[0].gaps).toEqual([]);
    expect(isClean(checks[0])).toBe(true);
  });
  it('the check still catches a split that is not one: "IsExternal = false" leaves the store door out', () => {
    const [check] = subReportChecksOf(schedules({ properties: [{ name: 'IsExternal', op: 'equals', value: 'false' }] }), () => whole);
    expect(check.duplicates).toEqual([]);
    expect(check.gaps.flatMap((g) => g.elements.map((e) => e.globalId)).sort()).toEqual(guid(C, F));
  });
  it('and an overlap: Exterior with the windows as a second part lists D and E twice', () => {
    const two = [...schedules(INTERIOR), { id: 's4', name: 'Windows', kind: 'all', createdAt: 1, sub: { parent: 's1', filter: { classes: ['IfcWindow'] } } } as ProjectSchedule];
    const [check] = subReportChecksOf(two, () => whole);
    expect(check.duplicates.flatMap((d) => d.elements.map((e) => e.globalId)).sort()).toEqual(guid(D, E, F));
  });
  it('the headless chain reads the same property names the schedules name', () => {
    expect(scheduleFilterProperties(schedules({ properties: [{ name: 'FireRating', op: 'present' }] }))).toEqual(['firerating', 'isexternal']);
  });
});

describe('a filter on the whole schedule', () => {
  it('scopes what the schedule lists, numbers over the scope, and the parts are cut from the scope', () => {
    const content = { filter: EXTERIOR, numbering: { marks: 'sequence' as const } };
    const schedules: ProjectSchedule[] = [
      { id: 's1', name: 'Joinery', kind: 'all', createdAt: 1, content },
      { id: 's2', name: 'Windows', kind: 'all', createdAt: 1, sub: { parent: 's1', filter: { kinds: ['window'] } } },
    ];
    expect(ids(scheduleOf(schedules, schedules[0], whole))).toEqual(guid(A, D, E, G));
    const part = scheduleOf(schedules, schedules[1], whole);
    expect(ids(part)).toEqual(guid(D, E));
    // The marks are the scope's: the part carries the same marks the schedule gave its windows.
    const marks = (d: ScheduleData) => d.entries.map((e) => [e.kind, e.mark, e.total]);
    expect(marks(part)).toEqual(marks(scheduleOf(schedules, schedules[0], whole)).filter(([k]) => k === 'window'));
  });
  it('is checked against its parts: a part outside the scope is neither a gap nor a duplicate', () => {
    const scoped = applyContent(whole, { filter: EXTERIOR });
    const check = checkSubReports({ id: 's1', name: 'Joinery', data: scoped }, [
      { id: 'a', name: 'Doors', filter: { kinds: ['door'] } },
      { id: 'b', name: 'Windows', filter: { kinds: ['window'] } },
    ]);
    expect(isClean(check)).toBe(true);
  });
  it('applied twice changes nothing', () => {
    const once = applyContent(whole, { filter: EXTERIOR, sort: { by: 'count' }, numbering: { marks: 'sequence' } });
    const twice = applyContent(once, { filter: EXTERIOR, sort: { by: 'count' }, numbering: { marks: 'sequence' } });
    expect(twice).toEqual(once);
  });
});

describe('old projects are unchanged', () => {
  it('a schedule and a content saved before the filters read back with no new field', () => {
    const old = { id: 's1', name: 'Joinery', kind: 'all', createdAt: 5, scale: 50, sub: { parent: 'p', filter: { kinds: ['door'], levels: ['Ground'], types: ['t'] } }, content: { sort: { by: 'mark' } } };
    expect(readSchedule(old)).toEqual(old);
    expect(readScheduleContent({ rows: { hidden: ['u'] } })).toEqual({ rows: { hidden: ['u'] } });
    expect(readScheduleContent({})).toBeUndefined();
    expect(symbolsShown(undefined)).toEqual({ elevation: true, plan: true });
  });
  it('a filter with only the old dimensions cuts as it did, and returns the data itself when it restricts nothing', () => {
    expect(subReportData(whole, {})).toBe(whole);
    expect(subReportData(whole, { properties: [] })).toBe(whole);
    expect(applyContent(whole, undefined)).toBe(whole);
    expect(cut({ kinds: ['window'] })).toEqual(guid(D, E, F));
    expect(cut({ levels: ['First'] })).toEqual(guid(F, G, H));
  });
  it('damaged filter fields are dropped; a damaged test does not take the others with it', () => {
    expect(readSubReportFilter({ classes: 'IfcDoor', predefined: [1, 'DOOR'], properties: [{ name: '', op: 'equals' }, { name: 'IsExternal', op: 'sometimes' }, { name: 'IsExternal', op: 'equals', value: 'true' }, 4] }))
      .toEqual({ predefined: ['DOOR'], properties: [{ name: 'IsExternal', op: 'equals', value: 'true' }] });
    expect(readSubReportFilter({ properties: [{ name: '', op: 'present' }] })).toEqual({});
  });
});

describe('the symbol choice is saved in the content', () => {
  it('survives a save and a read, and only false counts', () => {
    expect(readScheduleContent({ symbols: { elevation: false } })).toEqual({ symbols: { elevation: false } });
    expect(readScheduleContent({ symbols: { elevation: false, plan: false } })).toEqual({ symbols: { elevation: false, plan: false } });
    expect(readScheduleContent({ symbols: { elevation: true, plan: 'no' } })).toBeUndefined();
    expect(symbolsShown({ symbols: { plan: false } })).toEqual({ elevation: true, plan: false });
  });
});

describe.skipIf(!existsSync(FZK))('AC20-FZK-Haus, with its real values', () => {
  let fzk: ScheduleData;
  beforeAll(async () => { fzk = await rowsOf(FZK, ['thermaltransmittance', 'fireexit', 'firerating']); }, 120_000);
  const count = (f: SubReportFilter) => ids(subReportData(fzk, f)).length;
  it('has 5 IfcDoor and 11 IfcWindow, with the predefined type of an IFC2X3 file read as none', () => {
    expect(count({ classes: ['IfcDoor'] })).toBe(5);
    expect(count({ classes: ['IfcWindow'] })).toBe(11);
    expect(count({ predefined: ['NOTDEFINED'] })).toBe(0);
  });
  it('filters by the real Pset_DoorCommon / Pset_WindowCommon values', () => {
    const u = (v: string): SubReportFilter => ({ properties: [{ name: 'ThermalTransmittance', op: 'equals', value: v }] });
    expect(count(u('2'))).toBe(3);
    expect(count(u('1.4'))).toBe(13);
    expect(count({ classes: ['IfcDoor'], properties: u('1.4').properties })).toBe(2);
    expect(ids(subReportData(fzk, { properties: [{ name: 'FireExit', op: 'equals', value: 'false' }] }))).toEqual(['0pGAjlJMP3ifYPATVF5xAR']);
    expect(count({ properties: [{ name: 'FireExit', op: 'present' }] })).toBe(1);
    // FireRating is on four elements, empty on all of them.
    expect(count({ properties: [{ name: 'FireRating', op: 'present' }] })).toBe(0);
  });
  it('has no IsExternal on a door or a window: Exterior is empty and Interior is everything, and the pair still checks clean', () => {
    expect(count(EXTERIOR)).toBe(0);
    expect(count(INTERIOR)).toBe(16);
    const check = checkSubReports({ id: 'p', name: 'Joinery', data: fzk }, [{ id: 'e', name: 'Exterior', filter: EXTERIOR }, { id: 'i', name: 'Interior', filter: INTERIOR }]);
    expect(isClean(check)).toBe(true);
  });
});
