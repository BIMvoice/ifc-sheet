/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The phase of an element is read once per element for the models as they stand: every view drawn by
 * phase (`ViewDrawingHost`) and every sheet showing them (`useSheetContent`) share one lookup, read
 * again only after an edit (a new mutationVersion). Counted at the element resolution every read
 * starts with.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useViewerStore } from '@/store';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { phaseHiddenIds, phaseMeshes, phaseViewOf } from './phase-view.js';
import { PHASE_VIEW_PRESETS } from './phases.js';
import type { ViewGraphics } from './types.js';

const STEP = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('','',(''),(''),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPROJECT('0PhaseProject0000000001',$,'P',$,$,$,$,$,$);
#10=IFCWALL('0PhaseWallDemolish00001',$,'Demolish',$,$,$,$,$,$);
#11=IFCWALL('0PhaseWallNew0000000001',$,'New',$,$,$,$,$,$);
#20=IFCPROPERTYENUMERATEDVALUE('Status',$,(IFCLABEL('DEMOLISH')),$);
#21=IFCPROPERTYSET('0PhasePset0000000000001',$,'Pset_WallCommon',$,(#20));
#22=IFCRELDEFINESBYPROPERTIES('0PhaseRel00000000000001',$,$,$,(#10),#21);
#30=IFCPROPERTYENUMERATEDVALUE('Status',$,(IFCLABEL('NEW')),$);
#31=IFCPROPERTYSET('0PhasePset0000000000002',$,'Pset_WallCommon',$,(#30));
#32=IFCRELDEFINESBYPROPERTIES('0PhaseRel00000000000002',$,$,$,(#11),#31);
ENDSEC;
END-ISO-10303-21;
`;

const DEMOLITION: ViewGraphics = { phases: { show: [...PHASE_VIEW_PRESETS.demolition] } };
const PROPOSED: ViewGraphics = { phases: { show: [...PHASE_VIEW_PRESETS.proposed] } };
const MESHES = [{ expressId: 10 }, { expressId: 11 }, { expressId: 10 }];

let reads = 0;
const resolve = useViewerStore.getState().resolveGlobalIdFromModels;
beforeEach(async () => {
  seedModel('m', 0, await parseStep(STEP), 10);
  reads = 0;
  useViewerStore.setState({ resolveGlobalIdFromModels: (id: number) => { reads++; return resolve(id); } } as never);
});

/** One render: two views drawn by phase, and the sheet both are on. */
function renderViewsAndSheet() {
  const demolition = phaseHiddenIds(MESHES, phaseViewOf(DEMOLITION, undefined));
  const proposed = phaseHiddenIds(MESHES, phaseViewOf(PROPOSED, undefined));
  const sheet = [DEMOLITION, PROPOSED].map((g) => phaseMeshes(MESHES, phaseViewOf(g, undefined)));
  return { demolition, proposed, sheet };
}

describe('the phase lookup', () => {
  it('reads each element once for two views and a sheet, and again once after an edit', () => {
    const first = renderViewsAndSheet();
    assert.deepEqual([...(first.demolition ?? [])], [11], 'the demolition view leaves out the new wall');
    assert.deepEqual([...(first.proposed ?? [])], [10], 'the proposed view leaves out the wall to demolish');
    assert.deepEqual(first.sheet.map((m) => m?.map((x) => x.expressId)), [[10, 10], [11]]);
    assert.equal(reads, 2, 'two elements, read once each');
    renderViewsAndSheet();
    assert.equal(reads, 2, 'a second render reads nothing');
    useViewerStore.setState({ mutationVersion: useViewerStore.getState().mutationVersion + 1 });
    renderViewsAndSheet();
    assert.equal(reads, 4, 'an edit reads each element once more');
  });

  it('is per phase source: a project mapping of its own is read apart', () => {
    renderViewsAndSheet();
    assert.equal(reads, 2);
    phaseHiddenIds(MESHES, phaseViewOf(DEMOLITION, { unmarked: 'new' }));
    assert.equal(reads, 4);
  });
});
