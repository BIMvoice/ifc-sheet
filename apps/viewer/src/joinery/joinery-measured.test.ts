/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #485: the door and window schedule of a Bonsai-style IFC whose window states no OverallWidth / OverallHeight. The sheet and the CSV print the
 * size measured from the body (marked ≈), never 0 × 0; the size, the total and a level count are typed over and reset like any other cell;
 * and the engine reading the saved project hands out the same table.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, levelRowId, meshesByExpressId, scheduleOf, setJoineryOverride, clearJoineryOverride, DEFAULT_JOINERY_MAPPING, type ProjectSchedule } from '@bimvoice/ifcsheet';
import { joineryScheduleData, openModel, readProjectFile } from '@bimvoice/ifcsheet/headless';
import { joineryExport, layoutSchedule } from './schedule-layout';
import { joineryLabels, textsOf } from './export-test-util';

const LABELS = { locale: 'en' as const, title: 'Windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire rating', op: (o: string) => o };
const SCHEDULE: ProjectSchedule = { id: 's', name: 'Windows', kind: 'window', createdAt: 1 };
const project = { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING };
const mm = (m: number): number => Math.round(m * 1000);

/** A Bonsai-style IFC4 file: `windows` windows on the storey "Level 0", each a rectangle profile extruded; `stated` sizes the second one's Overall slots. */
function bonsaiIfc(windows: { stated?: [number | null, number | null] }[]): string {
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
    const num = (v: number | null | undefined): string => (v == null ? '$' : Number.isInteger(v) ? `${v}.` : String(v));
    const stated = w.stated ? `${num(w.stated[1])},${num(w.stated[0])}` : '$,$';
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

async function rowsOf() {
  const model = await openModel(new TextEncoder().encode(bonsaiIfc([{}, {}])));
  return joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null, meshesOf: meshesByExpressId(model.meshes) }], project, 'window');
}
const sheetTexts = (data: Awaited<ReturnType<typeof rowsOf>>): string[] => textsOf(layoutSchedule(data, LABELS)).map((t) => t.text);

describe('a window the IFC gives no size, in the schedule (#485)', () => {
  it('prints the measured size marked as measured, never 0 × 0, on the sheet and in the CSV figures', async () => {
    const data = await rowsOf();
    const e = data.entries[0];
    assert.ok(Math.abs(mm(e.width) - 1200) <= 1 && Math.abs(mm(e.height) - 1500) <= 1, `${mm(e.width)} x ${mm(e.height)}`);
    const texts = sheetTexts(data);
    assert.ok(texts.includes(`≈ ${mm(e.width)} × ≈ ${mm(e.height)}`));
    assert.ok(!texts.includes('0 × 0'));
    const table = joineryExport(data, joineryLabels(LABELS)).tables[0];
    const col = table.header.indexOf('Width (mm)');
    assert.deepEqual(table.rows[0].slice(col, col + 2), [mm(e.width), mm(e.height)]);
  });

  it('has its size, total and level count typed over from the sheet, and reset; a saved project and the engine print the same', async () => {
    const data = await rowsOf();
    const e = data.entries[0];
    let o = setJoineryOverride(undefined, e, 'size', '1250 × 1550', 'W1', data.entries);
    o = setJoineryOverride(o, e, 'total', '5', 'W1', data.entries);
    o = setJoineryOverride(o, e, levelRowId('Level 0'), '5', 'W1', data.entries);
    const typed = scheduleOf([SCHEDULE], SCHEDULE, data, o);
    const layout = layoutSchedule(typed, LABELS);
    const texts = textsOf(layout).map((t) => t.text);
    assert.ok(texts.includes('1250 × 1550') && !texts.some((t) => t.startsWith('≈')));
    assert.equal(texts.filter((t) => t === '5').length, 2);
    // Each typed cell can be picked on the sheet and is marked as typed over.
    const picked = (layout.cells ?? []).filter((c) => c.overridden).map((c) => c.column).sort();
    assert.deepEqual(picked, ['levels:Level 0', 'size', 'total']);
    const csv = joineryExport(typed, joineryLabels(LABELS)).tables[0];
    const col = csv.header.indexOf('Width (mm)');
    assert.deepEqual(csv.rows[0].slice(col, col + 2), [1250, 1550]);
    assert.equal(csv.rows[0][csv.header.indexOf('Total')], 5);

    // Saved and reopened by the engine: the same table.
    const saved = JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', schedules: [SCHEDULE], joineryOverrides: o });
    const facts = readProjectFile(saved);
    assert.deepEqual(facts.joineryOverrides, o);
    const headless = scheduleOf(facts.schedules, SCHEDULE, await rowsOf(), facts.joineryOverrides);
    assert.deepEqual(joineryExport(headless, joineryLabels(LABELS)).tables[0], csv);

    // Reset to the model's value: the measured size is back.
    const reset = clearJoineryOverride(clearJoineryOverride(clearJoineryOverride(o, e, 'size', data.entries), e, 'total', data.entries), e, levelRowId('Level 0'), data.entries);
    assert.deepEqual(sheetTexts(scheduleOf([SCHEDULE], SCHEDULE, data, reset)), sheetTexts(data));
  });

  it('measures only the side the IFC does not state, and marks only that side', async () => {
    const run = async (stated: [number | null, number | null]) => {
      const model = await openModel(new TextEncoder().encode(bonsaiIfc([{ stated }])));
      const data = joineryScheduleData([{ modelId: 'm', dataStore: model.dataStore, view: null, meshesOf: meshesByExpressId(model.meshes) }], project, 'window');
      return { e: data.entries[0], texts: sheetTexts(data) };
    };
    // Width stated (900), height missing: the body is 1.2 x 1.5, so only the height may come from it.
    const w = await run([0.9, null]);
    assert.equal(mm(w.e.width), 900);
    assert.ok(Math.abs(mm(w.e.height) - 1500) <= 1, String(mm(w.e.height)));
    assert.deepEqual([w.e.measuredWidth, w.e.measuredHeight], [false, true]);
    assert.ok(w.texts.includes(`900 × ≈ ${mm(w.e.height)}`), w.texts.join('|'));
    // Height stated (1800), width missing.
    const h = await run([null, 1.8]);
    assert.equal(mm(h.e.height), 1800);
    assert.ok(Math.abs(mm(h.e.width) - 1200) <= 1, String(mm(h.e.width)));
    assert.deepEqual([h.e.measuredWidth, h.e.measuredHeight], [true, false]);
    assert.ok(h.texts.includes(`≈ ${mm(h.e.width)} × 1800`), h.texts.join('|'));
  });
});

describe('a part of a split schedule, two measured groups 3 mm apart (#485)', () => {
  it('prints and marks only its own group\'s typed cell, not the cell of the neighbour listed in the other part', async () => {
    const [e] = (await rowsOf()).entries;
    const a = { ...e, key: 'untyped:window:1200×1500', mark: 'W1', measuredWidth: true, measuredHeight: true };
    const b = { ...e, key: 'untyped:window:1203×1500', mark: 'W2', measuredWidth: true, measuredHeight: true };
    const whole = { entries: [a, b], levels: ['Level 0'] };
    const part = { ...SCHEDULE, id: 'p', sub: { parent: 's', filter: { types: [b.key] } } };
    const typed = scheduleOf([SCHEDULE, part], part, whole, [{ type: a.key, row: 'name', value: 'W-A', about: 'W1' }]);
    assert.deepEqual(typed.entries.map((x) => x.key), [b.key]);
    const layout = layoutSchedule(typed, LABELS);
    assert.ok(!textsOf(layout).some((t) => t.text === 'W-A'), textsOf(layout).map((t) => t.text).join('|'));
    assert.deepEqual((layout.cells ?? []).filter((c) => c.overridden), []);
    // The other part, which lists the group the cell was typed on, prints it.
    const other = { ...SCHEDULE, id: 'q', sub: { parent: 's', filter: { types: [a.key] } } };
    assert.ok(textsOf(layoutSchedule(scheduleOf([SCHEDULE, other], other, whole, typed.overrides), LABELS)).some((t) => t.text === 'W-A'));
  });
});
