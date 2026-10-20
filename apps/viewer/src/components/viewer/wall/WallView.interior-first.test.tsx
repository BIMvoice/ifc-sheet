/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PR #120 review: a room's interior elevations made first, on a fresh
 * project, must not stop the Wall from laying out the starting set when the
 * geometry comes in.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { cleanup, render } from '@/test/render.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addInteriorElevations } from '@/project/interior-elevation-actions';
import { interiorElevationViews } from '@/project/interior-elevations';
import { useViewerStore } from '@/store';
import { WallView } from './WallView';

/** A 10 x 6 x 7 m block, the model's only geometry. */
function block(): MeshData {
  const [X, Y, Z] = [10, 6, 7];
  const positions = new Float32Array([0, 0, 0, X, 0, 0, X, Y, 0, 0, Y, 0, 0, 0, Z, X, 0, Z, X, Y, Z, 0, Y, Z]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  return { expressId: 1, ifcType: 'IfcWall', positions, normals: new Float32Array(positions.length), indices, color: [0.5, 0.5, 0.5, 1] };
}

beforeEach(() => {
  resetProject();
  const shiftedBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
  useViewerStore.setState({ models: new Map([['m', { id: 'm', name: 'm', visible: true, geometryResult: { coordinateInfo: { shiftedBounds } } } as never]]) });
});
afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
});

describe('the Wall on a project whose first sheet is interior elevations', () => {
  it('lays out the starting set beside it once the geometry is in', () => {
    addInteriorElevations('1 Hall', interiorElevationViews({ guid: 'G-ROOM', label: '1 Hall', ring: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], floor: 0, top: 2.5 }));
    assert.deepEqual(useProjectStore.getState().sheets.map((s) => s.number), ['A-401']);
    publishDrawingRuntime({ geometryResult: { meshes: [block()] } as unknown as GeometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false });
    render(<WallView />);
    const numbers = useProjectStore.getState().sheets.map((s) => s.number);
    assert.equal(numbers[0], 'A-401');
    assert.ok(numbers.includes('A-101') && numbers.includes('A-201'), numbers.join(', '));
  });
});
