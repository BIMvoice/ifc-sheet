/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drawing's building materials read each model's relationships once per
 * drawing (#154). Two drawings are two reads: what changed in the model
 * between them shows in the second.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import type { Drawing2D, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { useProjectStore } from './project-store';
import { viewMaterials } from './material-resolver';

const MODEL = 'm154-materials';

/**
 * Wall #10 of concrete (#20), a 0.2 mm foil (#21) and wool (#22). Layer set
 * #40 is concrete and wool; #41 adds the foil between them. `layerSet` is the
 * one the wall is associated with.
 */
function fixture(layerSet: 40 | 41): string {
  const lines = [
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'P',$,$,$,$,$,#2);",
    '#2=IFCUNITASSIGNMENT((#3));',
    '#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
    "#10=IFCWALLSTANDARDCASE('2XPyKWY018sA1ygZKgQPtU',$,'Wall',$,$,$,$,$,$);",
    "#20=IFCMATERIAL('Concrete C25/30',$,$);",
    "#21=IFCMATERIAL('PE foil',$,$);",
    "#22=IFCMATERIAL('Mineral wool',$,$);",
    '#30=IFCMATERIALLAYER(#20,200.,$,$,$,$,$);',
    '#31=IFCMATERIALLAYER(#21,0.2,$,$,$,$,$);',
    '#32=IFCMATERIALLAYER(#22,100.,$,$,$,$,$);',
    "#40=IFCMATERIALLAYERSET((#30,#32),'Plain',$);",
    "#41=IFCMATERIALLAYERSET((#30,#31,#32),'With foil',$);",
    `#50=IFCRELASSOCIATESMATERIAL('2XPyKWY018sA1ygZKgQPtX',$,$,$,(#10),#${layerSet});`,
  ];
  return `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

async function load(layerSet: 40 | 41): Promise<IfcDataStore> {
  const bytes = new TextEncoder().encode(fixture(layerSet));
  return new IfcParser().parseColumnar(bytes.buffer as ArrayBuffer, { disableWorkerScan: true });
}

const band = (materialId: number, y0: number, y1: number): DrawingPolygon => ({
  polygon: { outer: [{ x: 0, y: y0 }, { x: 4, y: y0 }, { x: 4, y: y1 }, { x: 0, y: y1 }], holes: [] },
  entityId: 10, ifcType: 'IfcWall', modelIndex: 0, isCut: true, materialId,
});

/** A fresh drawing of the wall's cut each time, as every redraw makes one. */
const drawing = (): Drawing2D => ({ cutPolygons: [band(20, 0, 0.2), band(22, 0.2, 0.3)], lines: [] }) as unknown as Drawing2D;

function show(dataStore: IfcDataStore): void {
  useViewerStore.setState({
    models: new Map([[MODEL, { ifcDataStore: dataStore }]]) as unknown as ReturnType<typeof useViewerStore.getState>['models'],
    mutationViews: new Map(),
    resolveGlobalIdFromModels: (id: number) => ({ modelId: MODEL, expressId: id }),
  } as unknown as Parameters<typeof useViewerStore.setState>[0]);
}

describe('viewMaterials reads the models afresh for each drawing (#154)', () => {
  beforeEach(() => useProjectStore.setState({ materials: [] }));

  it('draws the membrane of a layer set that has one', async () => {
    show(await load(41));
    assert.equal(viewMaterials(drawing())?.membranes.length, 1);
  });

  it('a drawing made after the model changed shows the model\'s new layers, not the last drawing\'s', async () => {
    show(await load(40));
    assert.equal(viewMaterials(drawing())?.membranes.length, 0, 'no foil in the layers before');
    // The model is replaced under the same id (a refresh): the wall now carries the foil layer set.
    show(await load(41));
    assert.equal(viewMaterials(drawing())?.membranes.length, 1, 'the foil shows in the next drawing');
  });
});
