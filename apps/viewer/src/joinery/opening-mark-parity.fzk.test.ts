/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #631: a door or window carries ONE mark, on the plan and in the schedule. The rows run the app's own path (TAGALL's planner over the label
 * reader, and the TAG tool's text) and the real joinery schedule (the header the sheet draws, the CSV and the Elements sheet) over one model,
 * and check that every plan tag is a mark its element is found under in the schedule, and the counts do not move.
 *
 * Rows: a door with a Tag, a door without, a window without a Tag, two doors of one type (same size) with different Tags, and a window whose
 * mark the user typed over. The model's Tags: D01 and D02 on the two doors of one type; none on the others.
 */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { scheduleOf, type JoineryCellOverride } from '@bimvoice/ifcsheet';
import { joineryExport, joineryScheduleLayout, type ScheduleLabels } from '@bimvoice/ifcsheet/project';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import { labelElementByGlobalId } from '@/labels/label-element.js';
import { resetProject, useProjectStore } from '@/project/project-store.js';
import { planTagAll } from '@/tagall/plan.js';
import { TAGALL_TYPES } from '@/tagall/types.js';
import { elementLabel } from '@/tagfields/element-tag.js';
import type { LabelTarget } from '@/labels/label-place.js';
import type { ViewElement } from '@/labels/view-elements.js';
import type { Pt } from '@/drafting/types.js';
import { scheduleData } from './schedule-data.js';
import { joineryLabels } from './export-test-util.js';

const box = (x: number, y: number, w = 0.9, h = 0.3): Pt[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const labels: ScheduleLabels = { locale: 'en', title: 'Doors and windows', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Operation', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: () => '' };

/** One door or window of the fixture: its class, name, Tag (null: none), and size in metres. */
interface Row { id: string; cls: 'IFCDOOR' | 'IFCWINDOW'; name: string; tag: string | null; width: number; height: number; expect: string }
const ROWS: Row[] = [
  { id: 'door-tagged-a', cls: 'IFCDOOR', name: 'Door', tag: 'D01', width: 0.9, height: 2.1, expect: 'D01' },
  { id: 'door-tagged-b', cls: 'IFCDOOR', name: 'Door', tag: 'D02', width: 0.9, height: 2.1, expect: 'D02' },
  { id: 'door-untagged', cls: 'IFCDOOR', name: 'Door', tag: null, width: 1.0, height: 2.1, expect: 'D2' },
  { id: 'window-untagged', cls: 'IFCWINDOW', name: 'Window', tag: null, width: 1.2, height: 1.2, expect: 'W1' },
  { id: 'window-overridden', cls: 'IFCWINDOW', name: 'Window', tag: null, width: 1.5, height: 1.2, expect: 'WX' },
];
const OVERRIDES: JoineryCellOverride[] = [{ type: 'untyped:window:1500×1200', row: 'mark', value: 'WX', about: 'W2 Window 1500×1200' }];

function fixtureIfc(): string {
  const rows = [
    `#1=IFCPROJECT('0Zr1xa$W9EkOxMp4Oi0001',$,'P',$,$,$,$,(#9),#8);`, `#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`, `#8=IFCUNITASSIGNMENT((#2));`,
    `#9=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#10,$);`, `#10=IFCAXIS2PLACEMENT3D(#11,$,$);`, `#11=IFCCARTESIANPOINT((0.,0.,0.));`, `#12=IFCLOCALPLACEMENT($,#10);`,
    `#13=IFCSITE('0Zr1xa$W9EkOxMp4Oi0002',$,'Site',$,$,#12,$,$,.ELEMENT.,$,$,$,$,$);`, `#14=IFCBUILDING('0Zr1xa$W9EkOxMp4Oi0003',$,'Building',$,$,#12,$,$,.ELEMENT.,$,$,$);`,
    `#15=IFCBUILDINGSTOREY('0Zr1xa$W9EkOxMp4Oi0004',$,'Level 0',$,$,#12,$,$,.ELEMENT.,0.);`,
    `#16=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0005',$,$,$,#1,(#13));`, `#17=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0006',$,$,$,#13,(#14));`, `#18=IFCRELAGGREGATES('0Zr1xa$W9EkOxMp4Oi0007',$,$,$,#14,(#15));`,
  ];
  ROWS.forEach((r, i) => {
    const tag = r.tag === null ? '$' : `'${r.tag}'`;
    const tail = r.cls === 'IFCDOOR' ? `.DOOR.,.NOTDEFINED.,$` : `.WINDOW.,.NOTDEFINED.,$`;
    rows.push(`#${100 + i}=${r.cls}('0Zr1xa$W9EkOxMp4Oi${String(10 + i).padStart(4, '0')}',$,'${r.name}',$,$,#12,$,${tag},${r.height},${r.width},${tail});`);
  });
  rows.push(`#90=IFCRELCONTAINEDINSPATIALSTRUCTURE('0Zr1xa$W9EkOxMp4Oi0008',$,$,$,(${ROWS.map((_, i) => `#${100 + i}`).join(',')}),#15);`);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME('t.ifc','2026-10-31T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${rows.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

const guidOf = (i: number): string => `0Zr1xa$W9EkOxMp4Oi${String(10 + i).padStart(4, '0')}`;

/** What the plan shows, by GlobalId: TAGALL's own planner over the label reader of the loaded models. */
function planTags(guids: string[]): Map<string, string> {
  const elements: ViewElement[] = guids.map((_, i) => ({ renderId: i + 1, anchor: { x: i * 3 + 0.45, y: 0.15 }, ring: box(i * 3, 0) }));
  const read = labelElementByGlobalId;
  const targets: LabelTarget[] = guids.map((g, i) => ({ guid: g, className: read(g)!.className(), anchor: elements[i].anchor, renderId: i + 1, ring: elements[i].ring }));
  const placement = { viewId: 'v', layerId: '0', textHeight: 0.25, textStyle: 'standard', dimStyle: 'standard', paperUnit: 0.1, locale: 'en' };
  const [mark, room] = TAGALL_TYPES;
  const { drafts } = planTagAll({ elements, targets, rooms: [], existing: [], placement, types: { mark, room }, read });
  return new Map(drafts.map((d) => [String(d.params.labelOf), d.shape.type === 'text' || d.shape.type === 'leader' ? d.shape.text : '']));
}

/** The schedule as the project prints it: the model's rows with the project's typed cells. */
const printed = () => scheduleOf([], { id: 'all' }, scheduleData('all'), useProjectStore.getState().joineryOverrides);

describe('one mark on the plan and in the schedule (#631)', () => {
  beforeEach(async () => {
    resetProject();
    seedModel('m', 0, await parseStep(fixtureIfc()), 1);
    useProjectStore.setState({ joineryOverrides: OVERRIDES });
  });
  afterEach(() => resetProject());

  it('puts on every plan tag the mark of the row, never the Name', () => {
    const tags = planTags(ROWS.map((_, i) => guidOf(i)));
    assert.equal(tags.size, ROWS.length);
    ROWS.forEach((r, i) => assert.equal(tags.get(guidOf(i)), r.expect, r.id));
    for (const text of tags.values()) assert.ok(!/^(door|window)$/i.test(text), `"${text}" is a class word`);
  });

  it('gives the TAG tool the same mark as TAGALL', () => {
    ROWS.forEach((r, i) => assert.equal(elementLabel(guidOf(i), 'mark'), r.expect, r.id));
  });

  it('lists every plan tag in the Mark cell of its type, in the sheet, the CSV and the Elements sheet', () => {
    const data = printed();
    const tags = planTags(ROWS.map((_, i) => guidOf(i)));
    const out = joineryExport(data, joineryLabels(labels));
    const types = out.tables[0], elements = out.tables[1];
    const drawn = joineryScheduleLayout(data, labels).prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));
    const cells = new Map(data.entries.map((e, i) => [e, String(types.rows[i][0]).split(', ')]));
    ROWS.forEach((r, i) => {
      const entry = data.entries.find((e) => e.occurrences.some((o) => o.globalId === guidOf(i)))!;
      const tag = tags.get(guidOf(i))!;
      assert.ok(cells.get(entry)!.includes(tag), `${r.id}: tag ${tag} is in the Mark cell ${cells.get(entry)!.join(', ')}`);
      assert.ok(drawn.includes(String(types.rows[data.entries.indexOf(entry)][0])), `${r.id}: the sheet draws the Mark cell`);
      assert.equal(elements.rows.find((row) => row[6] === guidOf(i))![1], tag, `${r.id}: the Elements sheet`);
    });
    // The one type of two Tags lists both; the others list one mark.
    const cellOf = (id: string) => String(types.rows[data.entries.findIndex((e) => e.occurrences.some((o) => o.globalId === guidOf(ROWS.findIndex((r) => r.id === id))))][0]);
    assert.equal(cellOf('door-tagged-a'), 'D01, D02');
    assert.equal(cellOf('door-untagged'), 'D2');
    assert.equal(cellOf('window-untagged'), 'W1');
    assert.equal(cellOf('window-overridden'), 'WX');
  });

  it('leaves the counts as the model has them: the marks change the Mark cell only', () => {
    const data = printed();
    const total = (d: typeof data) => d.entries.reduce((n, e) => n + e.total, 0);
    assert.equal(total(data), ROWS.length);
    assert.equal(total(data), total(scheduleData('all')));
    const rowOf = (guid: string) => data.entries.find((e) => e.occurrences.some((o) => o.globalId === guid))!;
    assert.equal(rowOf(guidOf(0)).total, 2);
    assert.equal(rowOf(guidOf(0)), rowOf(guidOf(1)));
    const out = joineryExport(data, joineryLabels(labels));
    assert.equal(out.tables[1].rows.length, ROWS.length);
  });
});

const BONSAI = '/Users/petruc/dev/bimvoice/_workspace/bonsai-test-models/house-2-storey.ifc';
describe('one mark on the real Bonsai model (#631)', { skip: !existsSync(BONSAI) }, () => {
  beforeEach(async () => {
    resetProject();
    seedModel('b', 0, await parseStep(readFileSync(BONSAI)), 1);
  });
  afterEach(() => resetProject());

  it('every door and window tag is in the Mark cell of its type, and none is a class word', () => {
    const data = printed();
    const occurrences = data.entries.flatMap((e) => e.occurrences.map((o) => ({ e, o })));
    assert.ok(occurrences.length >= 8, `${occurrences.length} doors and windows`);
    const tags = planTags(occurrences.map(({ o }) => o.globalId));
    assert.equal(tags.size, occurrences.length);
    const out = joineryExport(data, joineryLabels(labels));
    for (const { e, o } of occurrences) {
      const tag = tags.get(o.globalId)!;
      assert.ok(String(out.tables[0].rows[data.entries.indexOf(e)][0]).split(', ').includes(tag), `${tag} is in the Mark cell of ${e.name}`);
      assert.ok(!/^(door|window)$/i.test(tag), tag);
    }
    assert.ok(occurrences.some(({ o }) => /^D0\d$/.test(tags.get(o.globalId)!)), 'a door keeps its Bonsai Tag');
  });
});
