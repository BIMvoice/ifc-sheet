/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * Flipping a door on the drawing (#491): the flip prints in the plan overlays the sheet, the PDF and the DXF all read, survives save /
 * reopen and a model update (it is keyed by GlobalId), resets, and each action is one undo step. The model is never written.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store';
import { clearDraftHistory, undoDrafts, redoDrafts } from '@/drafting/draft-store';
import { parseProjectFile, serializeProject } from './project-file.js';
import { loadProjectDocument, projectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store.js';
import { symbolOverlays } from './plan-overlays.js';
import { FLIP_HINGE, FLIP_SWING, flipOnDrawing, resetFlipsOnDrawing } from './drawing-symbol-flips.js';

const GUID = '2O2Fr$t4X7Zf8NOew3FLOH';
const PLAN = { axis: 'y' as const, position: 1.2, flipped: false };

function door(): MeshData {
  const pts: number[] = [];
  for (const x of [-0.45, 0.45]) for (const y of [-1.05, 1.05]) for (const z of [-0.03, 0.03]) pts.push(x, y, z);
  return { expressId: 7, ifcType: 'IfcDoor', positions: new Float32Array(pts), origin: [5, 1.05, 2] } as unknown as MeshData;
}

/** Make render id `renderId` resolve to the door `GUID`, as a loaded model does (a reload may give it another render id). */
function loadModel(renderId: number): void {
  const ifcDataStore = { entities: { getGlobalId: () => GUID, getTypeName: () => 'IfcDoor' }, getEntity: () => undefined };
  useViewerStore.setState({
    models: new Map([['m', { ifcDataStore } as never]]),
    resolveGlobalIdFromModels: (id: number) => (id === renderId ? { modelId: 'm', expressId: 7 } : null),
  } as never);
}

const flips = () => useProjectStore.getState().symbolFlips;
/** The printed overlays of the door, as one string: what changes when its leaf moves. */
const printed = (mesh = door()) => JSON.stringify(symbolOverlays([mesh], PLAN, flips(), new Set()));

describe('door flips on the drawing', () => {
  beforeEach(() => {
    resetProject();
    clearDraftHistory();
    loadModel(7);
  });

  it('flipping the swing and the hinge side changes what the sheet, PDF and DXF print, and a reset brings it back', () => {
    const asModelStates = printed();
    flipOnDrawing([GUID], FLIP_SWING);
    const swung = printed();
    assert.notEqual(swung, asModelStates);
    flipOnDrawing([GUID], FLIP_HINGE);
    const both = printed();
    assert.notEqual(both, swung);
    assert.notEqual(both, asModelStates);
    resetFlipsOnDrawing([GUID]);
    assert.equal(printed(), asModelStates);
    assert.deepEqual(flips(), {});
  });

  it('keeps the flip across save and reopen, and across a model update that gives the door another render id', () => {
    flipOnDrawing([GUID], FLIP_SWING);
    const before = printed();
    const file = serializeProject(projectDocument());
    resetProject();
    assert.deepEqual(flips(), {});
    loadProjectDocument(parseProjectFile(file));
    assert.deepEqual(flips(), { [GUID]: FLIP_SWING });
    assert.equal(printed(), before);
    // The model is replaced: same GlobalId, new renderer id.
    loadModel(4107);
    syncProjectWithModels([], []);
    assert.deepEqual(flips(), { [GUID]: FLIP_SWING });
    assert.equal(printed({ ...door(), expressId: 4107 } as MeshData), before);
  });

  it('is one undo step per action, and redo puts it back', () => {
    flipOnDrawing([GUID], FLIP_SWING);
    flipOnDrawing([GUID], FLIP_HINGE);
    resetFlipsOnDrawing();
    assert.deepEqual(flips(), {});
    assert.ok(undoDrafts());
    assert.deepEqual(flips(), { [GUID]: FLIP_SWING | FLIP_HINGE });
    assert.ok(undoDrafts());
    assert.deepEqual(flips(), { [GUID]: FLIP_SWING });
    assert.ok(undoDrafts());
    assert.deepEqual(flips(), {});
    assert.ok(redoDrafts());
    assert.deepEqual(flips(), { [GUID]: FLIP_SWING });
  });

  it('never writes the model', () => {
    const mutations = useViewerStore.getState().mutationVersion;
    flipOnDrawing([GUID], FLIP_HINGE);
    assert.equal(useViewerStore.getState().mutationVersion, mutations);
  });
});
