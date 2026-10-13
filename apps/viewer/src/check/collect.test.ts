/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The check and the fix read the rooms of a plan from one place: the drawing runtime's geometry, which is what a
 * models-map (federated) load fills, not the viewer store's legacy single-model result.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeometryResult } from '@ifc-lite/geometry';
import { addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { currentDrawingRuntime, publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { roomsOfPlan } from '@/tagall/rooms';
import { useViewerStore } from '@/store';
import { currentFindings } from './collect.js';

/** A 4 x 3 m space from the floor to 3 m, as two triangles per face, in the viewer's Y-up frame. */
function space(expressId: number) {
  const v = [[0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3], [0, 3, 0], [4, 3, 0], [4, 3, 3], [0, 3, 3]];
  const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  return { expressId, ifcType: 'IfcSpace', positions: new Float32Array(v.flat()), indices: new Uint32Array(f.flat()) };
}

const GUID = 'ROOM-GUID';

beforeEach(() => {
  resetProject();
  // Two models are loaded (a models-map load): the viewer store's legacy single-model result is empty.
  useViewerStore.setState({
    geometryResult: null,
    models: new Map([['m', { ifcDataStore: { entities: { getGlobalId: () => GUID } } }]]) as never,
    mutationViews: new Map(),
    resolveGlobalIdFromModels: (id: number) => (id === 7 ? { modelId: 'm', expressId: 7 } : null),
  } as never);
  publishDrawingRuntime({ geometryResult: { meshes: [space(7)] } as unknown as GeometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false });
});

function planOnASheet(): string {
  const id = addProjectView({ kind: 'plan', name: 'Ground floor', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, scale: 100 } as never);
  useProjectStore.setState({ sheets: [{ id: 's1', number: 'A-101', name: 'Plans', createdAt: 0, viewports: [{ id: 'vp', viewId: id, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] }] as never });
  useViewDrawings.setState({ byView: { [id]: { ...EMPTY_VIEW_DRAWING, status: 'ready', drawing: { cutPolygons: [], projectionPolygons: [], lines: [] } as never } } });
  return id;
}

describe('the check reads the rooms TAGALL labels', () => {
  it('reports a room the fix would label as unlabelled, on a models-map load', () => {
    const id = planOnASheet();
    const view = useProjectStore.getState().views.find((v) => v.id === id)!;
    const fix = roomsOfPlan(view, useProjectStore.getState().levels, currentDrawingRuntime().geometryResult).map((r) => r.guid);
    assert.deepEqual(fix, [GUID], 'the fix has the room');
    const found = currentFindings().filter((f) => f.kind === 'unlabelledRooms');
    assert.deepEqual(found.map((f) => [f.viewId, f.guids, f.fix]), [[id, [GUID], 'TAGALL']]);
  });
});
