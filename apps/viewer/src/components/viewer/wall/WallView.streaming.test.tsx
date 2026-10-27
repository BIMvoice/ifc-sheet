/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #313: the starting set is laid out once the geometry has finished streaming, not on
 * its first batch, so the same model opens with the same set whatever the timing.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { cleanup, render } from '@/test/render.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { isSetSheet } from '@/project/drawing-set';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { WallView } from './WallView';

/** A 10 x 6 x 7 m block, standing for the first batch of a model's geometry. */
function block(): MeshData {
  const [X, Y, Z] = [10, 6, 7];
  const positions = new Float32Array([0, 0, 0, X, 0, 0, X, Y, 0, 0, Y, 0, 0, 0, Z, X, 0, Z, X, Y, Z, 0, Y, Z]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  return { expressId: 1, ifcType: 'IfcWall', positions, normals: new Float32Array(positions.length), indices, color: [0.5, 0.5, 0.5, 1] };
}

const publish = (meshes: MeshData[]) => act(() => publishDrawingRuntime({ geometryResult: { meshes } as unknown as GeometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false }));
const hasSet = () => useProjectStore.getState().sheets.some(isSetSheet);

beforeEach(() => {
  resetProject();
  const shiftedBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
  useViewerStore.setState({ geometryStreamingActive: false, models: new Map([['m', { id: 'm', name: 'm', visible: true, geometryResult: { coordinateInfo: { shiftedBounds } } } as never]]) });
});
afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
  useViewerStore.setState({ geometryStreamingActive: false });
});

describe('the Wall while the geometry is still streaming in', () => {
  it('waits for the stream to finish, then lays out the starting set once', async () => {
    useViewerStore.setState({ geometryStreamingActive: true });
    publish([block()]);
    render(<WallView />);
    assert.equal(hasSet(), false, 'the first batch is not the model');
    publish([block(), block()]);
    assert.equal(hasSet(), false, 'later batches do not start it either');
    // The set is laid out in the task after the stream finishes (#154).
    await act(async () => { useViewerStore.setState({ geometryStreamingActive: false }); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(hasSet(), true);
  });

  it('lays the set out at once when nothing is streaming', () => {
    publish([block()]);
    render(<WallView />);
    assert.equal(hasSet(), true);
  });
});
