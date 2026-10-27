/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #154: the Wall measures the building and lays the starting set out in the task after the one the finished geometry
 * arrives in (framing reads every element's box, about 40 ms on a large model, and that render also finishes the 3D).
 * The set is still laid out, once, and from the extent of the same meshes it is laid out with.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { cleanup, render } from '@/test/render.js';
import { laterTasksUntil, updateInThisTask } from '@/test/react-tasks.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { isSetSheet } from '@/project/drawing-set';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { resetProject, useProjectStore } from '@/project/project-store';
import { setExtent } from '@/draft-set/body';
import { useViewerStore } from '@/store';
import { WallView } from './WallView';

/** A 10 x 6 x 7 m block: the building. */
function block(): MeshData {
  const [X, Y, Z] = [10, 6, 7];
  const positions = new Float32Array([0, 0, 0, X, 0, 0, X, Y, 0, 0, Y, 0, 0, 0, Z, X, 0, Z, X, Y, Z, 0, Y, Z]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  return { expressId: 1, ifcType: 'IfcWall', positions, normals: new Float32Array(positions.length), indices, color: [0.5, 0.5, 0.5, 1], localBounds: { min: [0, 0, 0], max: [X, Y, Z] }, localToWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as unknown as MeshData;
}

// The model's whole box is far larger than the building, so a set measured without the meshes (on the whole box) differs
// from one measured on them: a set laid out from the meshes with an extent that does not match them shows.
const WHOLE = { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 60, z: 70 } };
const MESHES = [block()];
const publish = (meshes: MeshData[]) => publishDrawingRuntime({ geometryResult: { meshes } as unknown as GeometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false });
const hasSet = () => useProjectStore.getState().sheets.some(isSetSheet);
/** The laid-out set without its random ids. */
const setShape = () => {
  const { sheets, views } = useProjectStore.getState();
  return JSON.stringify({ sheets, views }).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID').replace(/"(createdAt|updatedAt)":\d+/g, '"$1":0');
};

beforeEach(() => {
  resetProject();
  useViewerStore.setState({ geometryStreamingActive: true, models: new Map([['m', { id: 'm', name: 'm', visible: true, geometryResult: { coordinateInfo: { shiftedBounds: WHOLE } } } as never]]) });
  act(() => publish(MESHES));
});
afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
  useViewerStore.setState({ geometryStreamingActive: false });
});

describe('the Wall when the geometry has finished streaming', () => {
  it('lays the set out in a later task, from the extent of the same meshes', async () => {
    render(<WallView />);
    assert.equal(hasSet(), false, 'not while streaming');

    await updateInThisTask(() => useViewerStore.setState({ geometryStreamingActive: false }));
    assert.equal(hasSet(), false, 'not in the task the geometry finishes in');

    await laterTasksUntil(hasSet);
    const laid = setShape();

    // The same set laid out directly from these meshes and their extent, as the Wall did it in one render before.
    resetProject();
    assert.ok(startDrawingSet(MESHES, setExtent([], MESHES, WHOLE).extent));
    assert.equal(laid, setShape());
  });
});
