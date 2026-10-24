/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model whose doors and windows carry no type (the demo project, FZK-Haus)
 * gives the schedule nothing to read a mark from. Its groups, one per class
 * and size, are marked D1, D2 / W1, W2 so the Mark row names every column
 * and an occurrence reads `W2.3` as it does for a configured type.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { occurrenceMark, scheduleData } from './schedule-data';

const MODEL = 'm-untyped-marks';
const guid = (n: number) => `0${String(n).padStart(21, '0')}`;

/** Three doors (two 900 wide, one 1000) and two windows (both 1200 x 1500), none typed. */
function fixture(): string {
  const lines = [
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#2);",
    '#2=IFCUNITASSIGNMENT((#3));',
    '#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
  ];
  [900, 900, 1000].forEach((w, i) => lines.push(`#${100 + i}=IFCDOOR('${guid(100 + i)}',$,'Door',$,$,$,$,$,2100.,${w}.,.DOOR.,.SINGLE_SWING_LEFT.,$);`));
  [200, 201].forEach((id) => lines.push(`#${id}=IFCWINDOW('${guid(id)}',$,'Window',$,$,$,$,$,1500.,1200.,.WINDOW.,.SINGLE_PANEL.,$);`));
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

async function show(): Promise<void> {
  const bytes = new TextEncoder().encode(fixture());
  const dataStore: IfcDataStore = await new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
  useViewerStore.setState({
    models: new Map([[MODEL, { ifcDataStore: dataStore }]]) as unknown as ReturnType<typeof useViewerStore.getState>['models'],
    mutationViews: new Map(),
  });
}

describe('marks for doors and windows the model does not type', () => {
  beforeEach(() => { useProjectStore.setState({ joineryTypes: [] }); });

  it('gives each class-and-size group its own mark, windows W, doors D', async () => {
    await show();
    const { entries } = scheduleData('all');
    const byName = (name: string) => entries.filter((e) => e.name === name).map((e) => `${e.mark}:${e.total}`);
    assert.deepEqual(byName('Window'), ['W1:2']);
    assert.deepEqual(byName('Door'), ['D1:2', 'D2:1']);
  });

  it('numbers an occurrence within its group, as it does within a configured type', async () => {
    await show();
    const door = scheduleData('door').entries.find((e) => e.total === 2);
    assert.ok(door);
    assert.deepEqual(door.occurrences.map((o) => occurrenceMark(door, o)), ['D1.1', 'D1.2']);
  });

  it('leaves a configured type its own mark and does not reuse it', async () => {
    await show();
    useProjectStore.setState({ joineryTypes: [{ id: 'spec-d1', kind: 'door', mark: 'D1', name: 'Entrance', width: 1.2, height: 2.4 } as never] });
    const marks = scheduleData('door').entries.map((e) => e.mark);
    assert.equal(new Set(marks).size, marks.length, `marks repeat: ${marks.join(',')}`);
    assert.ok(marks.includes('D1'));
  });
});
