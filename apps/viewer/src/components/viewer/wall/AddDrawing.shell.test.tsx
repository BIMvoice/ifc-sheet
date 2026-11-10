/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #657: "Add a drawing" on the IfcSheet screen offers the reflected ceiling
 * plan and the interior elevations of a room, as it offers the other kinds.
 * Mounted through `IfcSheetShell`, stepped into a sheet, the way a user gets there.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { cleanup, click, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { IfcSheetShell } from '../ifcsheet/IfcSheetShell.js';
import { stepInto, useWallNav } from './wall-nav.js';

const ROOM_ID = 7;
const STORE = {
  entities: { getGlobalId: (id: number) => `G${id}`, getName: (id: number) => `Room ${id}`, getTypeName: () => 'IfcSpace' },
  spatialHierarchy: null,
};
const MODEL = { id: 'm', name: 'm.ifc', ifcDataStore: STORE, geometryResult: null, visible: true, collapsed: false, schemaVersion: 'IFC4', loadedAt: 1, fileSize: 3, idOffset: 0, maxExpressId: 100 };

/** A closed box of an IfcSpace, 4 m by 3 m, 2.5 m high (Y up). */
function roomMesh(): MeshData {
  const [x, y, z] = [4, 2.5, 3];
  const positions = new Float32Array([0, 0, 0, x, 0, 0, x, 0, z, 0, 0, z, 0, y, 0, x, y, 0, x, y, z, 0, y, z]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { expressId: ROOM_ID, ifcType: 'IfcSpace', positions, normals: new Float32Array(positions.length), indices, color: [1, 1, 1, 1] } as MeshData;
}

const LEVELS = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

/** The Wall measures the building in a task of its own, so the extent a new drawing is hung on arrives a tick after the mount. */
async function mount(withRoom: boolean): Promise<HTMLElement> {
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
  const meshes = withRoom ? [roomMesh()] : [];
  const shiftedBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2.5, z: 3 } };
  const geometryResult = { meshes, coordinateInfo: { shiftedBounds } } as unknown as GeometryResult;
  useViewerStore.setState({ models: new Map([['m', { ...MODEL, geometryResult } as never]]) });
  publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  const ui = render(<IfcSheetShell />);
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  act(() => { stepInto(useProjectStore.getState().sheets[0].id); });
  const add = [...ui.querySelectorAll('button')].find((b) => b.textContent?.includes('Add a drawing'));
  assert.ok(add, 'the Add a drawing button');
  click(add);
  return ui;
}

const button = (ui: HTMLElement, text: RegExp): HTMLButtonElement => {
  const b = [...ui.querySelectorAll('button')].find((x) => text.test(x.textContent ?? ''));
  assert.ok(b, `a button ${text}`);
  return b;
};

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
});
afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
  useViewerStore.setState({ models: new Map() });
});

describe('Add a drawing on the IfcSheet screen (#657)', () => {
  it('offers a reflected ceiling plan, makes it for the storey picked and hangs it on the plans sheet', async () => {
    const ui = await mount(true);
    click(button(ui, /Reflected ceiling plan/));
    click(button(ui, /^Ground Floor$/));
    const { views, sheets } = useProjectStore.getState();
    const ceiling = views.find((v) => v.kind === 'plan' && v.reflected);
    assert.ok(ceiling && ceiling.kind === 'plan', 'a reflected plan was made');
    assert.equal(ceiling.level.name, 'Ground Floor');
    assert.equal(ceiling.name, 'Ground Floor ceiling');
    assert.ok(ceiling.cutHeight > 0);
    assert.ok(sheets.some((s) => (s.viewports ?? []).some((vp) => vp.viewId === ceiling.id)), 'it hangs on a sheet');
    // The plan of the storey stays its own.
    assert.ok(views.some((v) => v.kind === 'plan' && !v.reflected && v.level.name === 'Ground Floor'));
  });

  it('keeps "Plan of a storey" on the storey\'s own plan when a ceiling plan of it exists', async () => {
    const ui = await mount(true);
    click(button(ui, /Reflected ceiling plan/));
    click(button(ui, /^Ground Floor$/));
    const ceilingCount = () => useProjectStore.getState().views.filter((v) => v.kind === 'plan' && v.reflected).length;
    assert.equal(ceilingCount(), 1);
    const own = useProjectStore.getState().views.find((v) => v.kind === 'plan' && !v.reflected && !v.discipline && !v.site)!;
    const add = [...ui.querySelectorAll('button')].find((b) => b.textContent?.includes('Add a drawing'));
    click(add!);
    click(button(ui, /Plan of a storey/));
    click(button(ui, /^Ground Floor$/));
    assert.equal(ceilingCount(), 1, 'no second ceiling plan');
    assert.ok(useProjectStore.getState().views.includes(own));
  });

  it('offers the interior elevations of a room, makes them and steps into their sheet', async () => {
    const ui = await mount(true);
    click(button(ui, /Interior elevations/));
    click(button(ui, /Room 7/));
    const { views, sheets } = useProjectStore.getState();
    const made = views.filter((v) => v.kind === 'elevation' && v.interior);
    assert.equal(made.length, 4, 'one elevation per wall of the room');
    const sheet = sheets.find((s) => s.series === 'interiors');
    assert.ok(sheet, 'on a sheet of the interiors series');
    assert.deepEqual(new Set((sheet.viewports ?? []).map((vp) => vp.viewId)), new Set(made.map((v) => v.id)));
    assert.equal(useWallNav.getState().stepped, sheet.id, 'the screen steps into that sheet');
  });

  it('says in words that the model has no rooms, and does not offer the step', async () => {
    const ui = await mount(false);
    const choice = button(ui, /Interior elevations/);
    assert.equal(choice.disabled, true);
    assert.match(choice.textContent ?? '', /no rooms/);
  });
});
