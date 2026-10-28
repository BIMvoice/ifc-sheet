/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan's roofs are read once per model for every plan (#154), not once per
 * plan: the specs are kept until the model changes. They must not outlive an
 * edit (a roof edited in place shows its new outline on the next plan) nor the
 * model itself (an unloaded model's specs go with its data store).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { MutablePropertyView } from '@ifc-lite/mutations';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import type { ProjectView } from '@/project/types';
import { planRoofs } from './roof-plan';
import { collected } from '@/test/collect-garbage';

const MODEL = 'm154-roofs';
const guid = (n: number) => `0${String(n).padStart(21, '0')}`;
const spec = (width: number) => JSON.stringify({ name: 'roof', outline: [[0, 0], [width, 0], [width, 3], [0, 3]], eaveHeight: 3, rules: [] });

/** One storey (#30) holding one roof (#10) whose Spec is property #100. */
function fixture(): string {
  const lines = [
    `#1=IFCPROJECT('${guid(1)}',$,'P',$,$,$,$,$,$);`,
    `#2=IFCSITE('${guid(2)}',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);`,
    `#3=IFCBUILDING('${guid(3)}',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);`,
    `#30=IFCBUILDINGSTOREY('${guid(30)}',$,'Roof storey',$,$,$,$,$,.ELEMENT.,0.);`,
    `#4=IFCRELAGGREGATES('${guid(4)}',$,$,$,#1,(#2));`,
    `#5=IFCRELAGGREGATES('${guid(5)}',$,$,$,#2,(#3));`,
    `#6=IFCRELAGGREGATES('${guid(6)}',$,$,$,#3,(#30));`,
    `#10=IFCROOF('${guid(10)}',$,'Roof',$,$,$,$,$,.GABLE_ROOF.);`,
    `#31=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(31)}',$,$,$,(#10),#30);`,
    `#100=IFCPROPERTYSINGLEVALUE('Spec',$,IFCTEXT('${spec(4)}'),$);`,
    `#101=IFCPROPERTYSET('${guid(101)}',$,'Pset_IfcLiteRoofSystem',$,(#100));`,
    `#102=IFCRELDEFINESBYPROPERTIES('${guid(102)}',$,$,$,(#10),#101);`,
  ];
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

async function load(): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(fixture());
  return new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
}

const PLAN = { id: 'p', name: 'p', kind: 'plan', createdAt: 0, level: { storeyGlobalIds: [] } } as unknown as ProjectView;
const PLANE: SectionPlaneConfig = { axis: 'y', position: 1, flipped: false };

function show(dataStore: IfcDataStore | null, view: MutablePropertyView | null = null, mutationVersion = 0): void {
  useViewerStore.setState({
    models: new Map(dataStore ? [[MODEL, { ifcDataStore: dataStore }]] : []) as unknown as ReturnType<typeof useViewerStore.getState>['models'],
    mutationViews: new Map(view ? [[MODEL, view]] : []),
    mutationVersion,
  } as unknown as Parameters<typeof useViewerStore.setState>[0]);
}

/** The x extent of the one roof's outline on the plan. */
function extent(): number {
  const roofs = planRoofs(PLAN, PLANE);
  assert.equal(roofs.length, 1, 'the roof is on the plan');
  const xs = roofs[0].outline.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
}

describe('planRoofs keeps the roof specs until the model changes (#154)', () => {
  beforeEach(() => show(null));

  it('a roof edited in place shows its new outline on the next plan', async () => {
    const store = await load();
    const view = new MutablePropertyView(null, MODEL);
    show(store, view, 1);
    const before = extent();
    // The roof is widened in the overlay: the same store, the same edit view, a newer mutation version.
    view.setPositionalAttribute(100, 2, spec(8));
    show(store, view, 2);
    assert.ok(extent() > before * 1.5, 'the plan after the edit draws the wider roof, not the cached one');
  });

  it('the same model read twice reuses the specs', async () => {
    const store = await load();
    show(store, null, 1);
    assert.equal(planRoofs(PLAN, PLANE)[0].spec, planRoofs(PLAN, PLANE)[0].spec);
  });

  it('an unloaded model\'s specs do not outlive its data store', async () => {
    // The specs are what the cache holds (they do not point back at the store), so it is a spec that must go.
    const ref = await (async () => {
      const store = await load();
      show(store, null, 1);
      const roofs = planRoofs(PLAN, PLANE);
      assert.equal(roofs.length, 1);
      return new WeakRef(roofs[0].spec);
    })();
    show(null);
    assert.ok(await collected(ref), 'the removed model\'s roof specs were still held by the roof cache');
  });
});
