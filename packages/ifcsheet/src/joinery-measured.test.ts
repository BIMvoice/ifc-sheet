/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #485: a window the IFC gives no OverallWidth / OverallHeight (a non-parametric window, as Bonsai exports) is listed with the size of its body,
 * measured in its own frame, and marked measured; every cell of the schedule, the measured ones and the counts too, can be typed over.
 * The fixture is written here: a 1200 × 100 × 1500 mm window body turned 30 degrees in the plan, on a storey, with the size slots `$`,
 * and a second window of the same body with a stated size.
 */

import { describe, expect, it } from 'vitest';
import { openModel } from './headless.js';
import { joineryScheduleData } from './joinery-schedule.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { meshesByExpressId, measureElementSize } from './element-size.js';
import { clearJoineryOverride, joineryCellText, levelRowId, orphanedJoineryOverrides, overrideNumbers, readJoineryOverrides, setJoineryOverride } from './joinery-overrides.js';
import { readProjectFile } from './project-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';
import { scheduleOf } from './sub-reports.js';

const mm = (m: number): number => Math.round(m * 1000);

/** A Bonsai-style IFC4 file: `windows` windows on the storey "Level 0", each a rectangle profile extruded; `stated` sizes the second one's Overall slots. */
function bonsaiIfc(windows: { stated?: [number, number] }[]): string {
  const rows = [
    `#1=IFCPROJECT('0Zr1xa$W9EkOxMp4Oi0001',$,'P',$,$,$,$,(#9),#8);`,
    `#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`,
    `#8=IFCUNITASSIGNMENT((#2));`,
    `#9=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#10,$);`,
    `#10=IFCAXIS2PLACEMENT3D(#11,$,$);`,
    `#11=IFCCARTESIANPOINT((0.,0.,0.));`,
    `#12=IFCLOCALPLACEMENT($,#10);`,
    `#13=IFCSITE('0Zr1xa$W9EkOxMp4Oi0002',$,'Site',$,$,#12,$,$,.ELEMENT.,$,$,$,$,$);`,
    `#14=IFCBUILDING('0Zr1xa$W9EkOxMp4Oi0003',$,'Building',$,$,#12,$,$,.ELEMENT.,$,$,$);`,
    `#15=IFCBUILDINGSTOREY('0Zr1xa$W9EkOxMp4Oi0004',$,'Level 0',$,$,#12,$,$,.ELEMENT.,0.);`,
    `#16=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0005',$,$,$,#1,(#13));`,
    `#17=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0006',$,$,$,#13,(#14));`,
    `#18=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0007',$,$,$,#14,(#15));`,
    // The shared body: a 1.2 x 0.1 rectangle, extruded 1.5 up.
    `#20=IFCCARTESIANPOINT((0.,0.));`,
    `#21=IFCAXIS2PLACEMENT2D(#20,$);`,
    `#22=IFCRECTANGLEPROFILEDEF(.AREA.,$,#21,1.2,0.1);`,
    `#23=IFCDIRECTION((0.,0.,1.));`,
    `#24=IFCEXTRUDEDAREASOLID(#22,#10,#23,1.5);`,
    `#25=IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#24));`,
    `#26=IFCPRODUCTDEFINITIONSHAPE($,$,(#25));`,
  ];
  const ids: number[] = [];
  windows.forEach((w, i) => {
    const base = 100 + i * 10;
    const turn = i === 0 ? '0.8660254037844387,0.5' : '1.,0.';
    const stated = w.stated ? `${w.stated[1]},${w.stated[0]}` : '$,$';
    rows.push(
      `#${base}=IFCCARTESIANPOINT((${2 + i * 3}.,1.,0.));`,
      `#${base + 1}=IFCDIRECTION((${turn},0.));`,
      `#${base + 2}=IFCAXIS2PLACEMENT3D(#${base},$,#${base + 1});`,
      `#${base + 3}=IFCLOCALPLACEMENT(#12,#${base + 2});`,
      `#${base + 4}=IFCWINDOW('0Zr1xa$W9EkOxMp4Oi${String(10 + i).padStart(4, '0')}',$,'Window ${i + 1}',$,$,#${base + 3},#26,$,${stated},.WINDOW.,.NOTDEFINED.,$);`,
    );
    ids.push(base + 4);
  });
  rows.push(`#90=IFCRELCONTAINEDINSPATIALSTRUCTURE('0Zr1xa$W9EkOxMp4Oi0008',$,$,$,(${ids.map((i) => `#${i}`).join(',')}),#15);`);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME('bonsai.ifc','2026-10-27T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${rows.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };

async function scheduleOfFixture(windows: Parameters<typeof bonsaiIfc>[0]) {
  const model = await openModel(new TextEncoder().encode(bonsaiIfc(windows)));
  const data = joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null, meshesOf: meshesByExpressId(model.meshes) }], project, 'window');
  return { model, data };
}

describe('the size of a window the IFC gives none (#485)', () => {
  it('is measured from the body in its own frame, within 1 mm, and marked measured', async () => {
    const { model, data } = await scheduleOfFixture([{}]);
    expect(data.entries).toHaveLength(1);
    const [entry] = data.entries;
    // The body is 1200 x 1500 mm (100 mm thick), turned 30 degrees: the axis-aligned box of it would be wider.
    expect(Math.abs(mm(entry.width) - 1200)).toBeLessThanOrEqual(1);
    expect(Math.abs(mm(entry.height) - 1500)).toBeLessThanOrEqual(1);
    expect(entry.measured).toBe(true);
    expect(entry.occurrences[0].measured).toBe(true);
    expect(entry.key).toBe(`untyped:window:${mm(entry.width)}×${mm(entry.height)}`);
    expect(measureElementSize(model.meshes.filter((m) => m.expressId === entry.occurrences[0].expressId))).toMatchObject({ width: expect.closeTo(1.2, 3), height: expect.closeTo(1.5, 3) });
  });

  it('is 0 x 0 without the geometry to measure, and not marked measured', async () => {
    const model = await openModel(new TextEncoder().encode(bonsaiIfc([{}])), { geometry: false });
    const data = joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null }], project, 'window');
    expect(data.entries[0].width).toBe(0);
    expect(data.entries[0].measured).toBeUndefined();
  });

  it('is the stated size when the IFC states one, and the group is not marked measured', async () => {
    const { data } = await scheduleOfFixture([{ stated: [1.0, 1.4] }]);
    expect(data.entries[0].width).toBeCloseTo(1.0, 6);
    expect(data.entries[0].height).toBeCloseTo(1.4, 6);
    expect(data.entries[0].measured).toBeUndefined();
  });
});

describe('every cell of the joinery schedule can be typed over (#485)', () => {
  it('the size, the total and a level count, then reset, and kept by a saved project', async () => {
    const { data } = await scheduleOfFixture([{}, {}]);
    const entry = data.entries[0];
    expect(entry.total).toBe(2);
    let o = setJoineryOverride(undefined, entry, 'size', '1250 × 1500', 'W1', [entry]);
    o = setJoineryOverride(o, entry, 'total', '3', 'W1', [entry]);
    o = setJoineryOverride(o, entry, levelRowId('Level 0'), '3', 'W1', [entry]);
    expect(o.map((x) => x.row)).toEqual(['size', 'total', 'levels:Level 0']);
    expect(joineryCellText(o, entry, 'size', 'model', [entry])).toBe('1250 × 1500');
    expect(joineryCellText(o, entry, 'total', '2', [entry])).toBe('3');
    expect(joineryCellText(o, entry, levelRowId('Level 0'), '2', [entry])).toBe('3');
    expect(overrideNumbers('1250 × 1500')).toEqual([1250, 1500]);
    expect(overrideNumbers('1,5')).toEqual([1.5]);
    expect(overrideNumbers('about 3')).toEqual([]);
    // Save and reopen.
    const text = JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'House', joineryOverrides: o });
    expect(readProjectFile(text).joineryOverrides).toEqual(o);
    expect(readJoineryOverrides(JSON.parse(text).joineryOverrides)).toEqual(o);
    // Reset to the model's value.
    const reset = clearJoineryOverride(clearJoineryOverride(clearJoineryOverride(o, entry, 'size', [entry]), entry, 'total', [entry]), entry, levelRowId('Level 0'), [entry]);
    expect(reset).toEqual([]);
    expect(joineryCellText(reset, entry, 'size', 'model', [entry])).toBe('model');
    // A row that is no row of the schedule is refused.
    expect(setJoineryOverride(undefined, entry, 'bogus', '1', '', [entry])).toEqual([]);
    expect(setJoineryOverride(undefined, entry, 'levels:', '1', '', [entry])).toEqual([]);
  });
});

describe('a typed number keeps its thousands and its decimals (#485)', () => {
  it('reads 1,250 and 1.250 as 1250, 1,25 and 1.5 as decimals, and a mixed number by its last mark', () => {
    expect(overrideNumbers('1,250 × 1,550')).toEqual([1250, 1550]);
    expect(overrideNumbers('1.250')).toEqual([1250]);
    expect(overrideNumbers('1,25')).toEqual([1.25]);
    expect(overrideNumbers('1.5')).toEqual([1.5]);
    expect(overrideNumbers('0,250')).toEqual([0.25]);
    expect(overrideNumbers('1.250,5')).toEqual([1250.5]);
    expect(overrideNumbers('1,250.5')).toEqual([1250.5]);
    expect(overrideNumbers('1,250,000')).toEqual([1250000]);
    expect(overrideNumbers('1,2,5')).toEqual([]);
  });
});

describe('a cell typed on a group keyed by its measured size (#485)', () => {
  it('is not reported missing while the size is unread (no geometry), and is once the sizes are read and differ', async () => {
    const model = await openModel(new TextEncoder().encode(bonsaiIfc([{}])), { geometry: false });
    const withoutGeometry = joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null }], project, 'window').entries;
    expect(withoutGeometry[0].key).toMatch(/^untyped:window:(\?|0×0)$/);
    const typed = [{ type: 'untyped:window:1200×1500', row: 'name', value: 'Fenster', about: 'W' }];
    expect(orphanedJoineryOverrides(typed, withoutGeometry)).toEqual([]);
    const read = [{ ...withoutGeometry[0], key: 'untyped:window:900×900' }];
    expect(orphanedJoineryOverrides(typed, read)).toHaveLength(1);
  });
});

/** `meshesOf` over the model's meshes with every position scaled by `f`: the same windows measured `f` times larger (re-tessellation noise, or a real change). */
function scaledMeshesOf(meshes: Parameters<typeof meshesByExpressId>[0], f: number) {
  const of = meshesByExpressId(meshes);
  return (id: number) => of(id)?.map((m) => {
    const origin = m.origin ?? [0, 0, 0];
    const positions = Float32Array.from(m.positions, (v, i) => (v + origin[i % 3]) * f);
    return { ...m, positions, origin: [0, 0, 0] as [number, number, number] };
  });
}

describe('the identity of a group keyed by its measured size (#485)', () => {
  const save = (o: unknown) => readProjectFile(JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'House', joineryOverrides: o })).joineryOverrides;

  async function typedOn(windows: Parameters<typeof bonsaiIfc>[0]) {
    const model = await openModel(new TextEncoder().encode(bonsaiIfc(windows)));
    const at = (f: number | null) => joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null, ...(f === null ? {} : { meshesOf: scaledMeshesOf(model.meshes, f) }) }], project, 'window').entries;
    const [entry] = at(1);
    const typed = save(setJoineryOverride(setJoineryOverride(undefined, entry, 'name', 'Fenster', 'W1', [entry]), entry, 'size', '1250 × 1550', 'W1', [entry]));
    return { at, entry, typed };
  }

  it('keeps its typed cells when re-tessellation moves the measured size by a millimetre', async () => {
    const { at, entry, typed } = await typedOn([{}, {}]);
    const moved = at(1.001);
    expect(moved.map((e) => e.key)).not.toContain(entry.key);
    for (const e of moved) {
      expect(joineryCellText(typed, e, 'name', 'model', moved)).toBe('Fenster');
      expect(joineryCellText(typed, e, 'size', 'model', moved)).toBe('1250 × 1550');
    }
    expect(orphanedJoineryOverrides(typed, moved)).toEqual([]);
    // Typed again on the moved group, the cell replaces the one saved under the old key instead of adding a second.
    const retyped = setJoineryOverride(typed, moved[0], 'name', 'Okno', 'W1', moved);
    expect(retyped.filter((o) => o.row === 'name')).toHaveLength(1);
    expect(joineryCellText(retyped, entry, 'name', 'model', [entry])).toBe('Okno');
  });

  it('keeps its typed cells without geometry, and they apply again once the geometry is measured, a millimetre off', async () => {
    const { at, entry, typed } = await typedOn([{}]);
    const unread = at(null);
    expect(unread[0].key).toBe('untyped:window:?');
    expect(joineryCellText(typed, unread[0], 'name', 'model', [unread[0]])).toBe('model');
    expect(orphanedJoineryOverrides(typed, unread)).toEqual([]);
    const loaded = at(1.001);
    expect(loaded[0].key).not.toBe(entry.key);
    expect(orphanedJoineryOverrides(typed, loaded)).toEqual([]);
    expect(joineryCellText(typed, loaded[0], 'name', 'model', [loaded[0]])).toBe('Fenster');
  });

  it('keeps its typed cells when the size is typed over, which does not re-key the group', async () => {
    const { at, typed } = await typedOn([{}]);
    const [again] = at(1.001);
    expect(joineryCellText(typed, again, 'size', 'model', [again])).toBe('1250 × 1550');
    expect(joineryCellText(typed, again, 'name', 'model', [again])).toBe('Fenster');
  });

  it('reports its typed cells as orphaned when the model really changed size, and does not move them', async () => {
    const { at, typed } = await typedOn([{}]);
    const changed = at(1.05);
    expect(joineryCellText(typed, changed[0], 'name', 'model', [changed[0]])).toBe('model');
    expect(orphanedJoineryOverrides(typed, changed)).toEqual([{ type: typed![0].type, about: 'W1', count: 2 }]);
    // A stated size is not measured: it has no tolerance, a millimetre is a different group.
    const stated = await scheduleOfFixture([{ stated: [1.2, 1.5] }]);
    const near = [{ type: 'untyped:window:1201×1500', row: 'name', value: 'X', about: 'W' }];
    expect(joineryCellText(near, stated.data.entries[0], 'name', 'model', [stated.data.entries[0]])).toBe('model');
    // A door group whose size is unread does not hide a window's orphaned cells.
    const doorUnread = [{ key: 'untyped:door:?' }, ...changed];
    expect(orphanedJoineryOverrides(typed, doorUnread)).toHaveLength(1);
  });

  it('takes the nearest saved size when two are within reach, the group\'s own key first', () => {
    const entry = { key: 'untyped:window:1201×1500', measuredWidth: true, measuredHeight: true };
    const saved = [
      { type: 'untyped:window:1205×1500', row: 'name', value: 'far', about: '' },
      { type: 'untyped:window:1200×1500', row: 'name', value: 'near', about: '' },
      { type: 'untyped:window:?', row: 'name', value: 'legacy', about: '' },
    ];
    expect(joineryCellText(saved, entry, 'name', 'model', [entry])).toBe('near');
    expect(joineryCellText([...saved, { type: entry.key, row: 'name', value: 'own', about: '' }], entry, 'name', 'model', [entry])).toBe('own');
    expect(joineryCellText([saved[2], saved[0]], entry, 'name', 'model', [entry])).toBe('far');
  });

  it('reads an old project: a key saved before the move, and one saved before sizes were measured, still apply', async () => {
    const { at } = await typedOn([{}]);
    const [entry] = at(1.001);
    const [w, h] = [mm(entry.width), mm(entry.height)];
    const old = `{"format":"${PROJECT_FILE_FORMAT}","name":"House","joineryOverrides":[`
      + `{"type":"untyped:window:${w - 1}×${h - 1}","row":"name","value":"Fenster","about":"W1 Window"},`
      + `{"type":"untyped:window:?","row":"fire","value":"EI30","about":"W1 Window"}]}`;
    const typed = readProjectFile(old).joineryOverrides;
    expect(joineryCellText(typed, entry, 'name', 'model', [entry])).toBe('Fenster');
    expect(joineryCellText(typed, entry, 'fire', 'model', [entry])).toBe('EI30');
    expect(orphanedJoineryOverrides(typed, [entry])).toEqual([]);
  });
});

describe('two measured groups a few millimetres apart (#485)', () => {
  // Both within reach of each other's key: each saved cell belongs to the nearer group alone, so neither group reads, overwrites or deletes the other's.
  const a = { key: 'untyped:window:1200×1500', measuredWidth: true, measuredHeight: true };
  const b = { key: 'untyped:window:1203×1500', measuredWidth: true, measuredHeight: true };
  const groups = [a, b];
  const typedOnA = setJoineryOverride(undefined, a, 'name', 'W-A', 'A', groups);

  it('a group does not read the cell typed on its neighbour', () => {
    expect(joineryCellText(typedOnA, a, 'name', 'model', groups)).toBe('W-A');
    expect(joineryCellText(typedOnA, b, 'name', 'model', groups)).toBe('model');
    // The order of the groups does not change whose cell it is.
    expect(joineryCellText(typedOnA, b, 'name', 'model', [b, a])).toBe('model');
  });

  it('typing on a group keeps the neighbour\'s cell', () => {
    const both = setJoineryOverride(typedOnA, b, 'name', 'W-B', 'B', groups);
    expect(joineryCellText(both, a, 'name', 'model', groups)).toBe('W-A');
    expect(joineryCellText(both, b, 'name', 'model', groups)).toBe('W-B');
    expect(both.map((o) => o.type)).toEqual([a.key, b.key]);
  });

  it('resetting a group keeps the neighbour\'s cell, and resets only its own', () => {
    expect(clearJoineryOverride(typedOnA, b, 'name', groups)).toEqual(typedOnA);
    const both = setJoineryOverride(typedOnA, b, 'name', 'W-B', 'B', groups);
    expect(clearJoineryOverride(both, b, 'name', groups)).toEqual(typedOnA);
    expect(clearJoineryOverride(both, a, 'name', groups).map((o) => o.value)).toEqual(['W-B']);
  });

  it('a cell saved between the two belongs to the nearer one, and a tie is decided the same whatever the order', () => {
    const between = [{ type: 'untyped:window:1201×1500', row: 'name', value: 'X', about: '' }];
    expect([a, b].map((g) => joineryCellText(between, g, 'name', 'model', groups))).toEqual(['X', 'model']);
    // A cell as near to two groups (1202: 2 from 1200 and from 1204) is one group's, the same one whatever the order of the groups.
    const c = { key: 'untyped:window:1204×1500', measuredWidth: true, measuredHeight: true };
    const tie = [{ type: 'untyped:window:1202×1500', row: 'name', value: 'T', about: '' }];
    for (const order of [[a, c], [c, a]]) expect([a, c].map((g) => joineryCellText(tie, g, 'name', 'model', order))).toEqual(['T', 'model']);
  });

  it('a part of a split that lists only one of them still knows the other, so it does not take the other\'s cell', () => {
    const entry = (g: typeof a, mark: string) => ({ ...g, mark, name: mark, kind: 'window' as const, counts: {}, total: 1, occurrences: [] });
    const whole = { entries: [entry(a, 'W1'), entry(b, 'W2')], levels: [] };
    const schedule = { id: 's' }, part = { id: 'p', sub: { parent: 's', filter: { types: [b.key] } } };
    const data = scheduleOf([schedule, part], part, whole, typedOnA);
    expect(data.entries.map((e) => e.key)).toEqual([b.key]);
    expect(data.groups?.map((e) => e.key)).toEqual([a.key, b.key]);
    expect(joineryCellText(data.overrides, data.entries[0], 'name', 'model', data.groups ?? data.entries)).toBe('model');
  });

  it('a key saved before sizes were measured still reads on both, and resetting one keeps it on the other', () => {
    const legacy = [{ type: 'untyped:window:?', row: 'fire', value: 'EI30', about: '' }];
    expect(groups.map((g) => joineryCellText(legacy, g, 'fire', 'model', groups))).toEqual(['EI30', 'EI30']);
    const reset = clearJoineryOverride(legacy, b, 'fire', groups);
    expect(groups.map((g) => joineryCellText(reset, g, 'fire', 'model', groups))).toEqual(['EI30', 'model']);
    expect(reset).toEqual([{ type: a.key, row: 'fire', value: 'EI30', about: '' }]);
  });
});
