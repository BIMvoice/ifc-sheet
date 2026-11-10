/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store';
import type { ScheduleModel } from '@bimvoice/ifcsheet/project';
import { entryViews } from './element-views-source';
import { loadedScheduleModels } from './schedule-models';
import type { ScheduleData, ScheduleEntry } from './schedule-data';

const mesh = (expressId: number): MeshData => ({ expressId, positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), color: [1, 1, 1, 1] }) as MeshData;

describe('the meshes of a schedule occurrence', () => {
  it('are the model\'s own id shifted by its idOffset, as a federated model\'s meshes are', () => {
    useViewerStore.setState({ models: new Map([['b', { id: 'b', ifcDataStore: {}, idOffset: 1000, geometryResult: { meshes: [mesh(5), mesh(1005), mesh(1005)] } } as never]]), mutationViews: new Map() });
    const [model] = loadedScheduleModels({ instanced: () => undefined });
    assert.equal(model.meshesOf!(5)!.length, 2);
    assert.equal(model.meshesOf!(6), undefined);
  });
});

describe('the views of a schedule', () => {
  it('leave out, and log once, an entry whose occurrences have no body geometry', async () => {
    const entry: ScheduleEntry = {
      key: 'nobody', kind: 'window', spec: null, mark: 'W9', name: 'Bodiless', width: 1, height: 1, counts: {}, total: 1,
      occurrences: [{ modelId: 'b', expressId: 5, globalId: 'g', level: 'L', tag: null, number: 1 }],
    };
    const data: ScheduleData = { levels: [], entries: [entry] };
    useViewerStore.setState({ models: new Map([['b', { id: 'b', ifcDataStore: {}, idOffset: 0, geometryResult: { meshes: [], coordinateInfo: { shiftedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } } } } as never]]) });
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => { warned.push(a.join(' ')); };
    try {
      assert.equal((await entryViews(data, 50, loadedScheduleModels({ instanced: () => undefined }))).size, 0);
      await entryViews(data, 50, loadedScheduleModels({ instanced: () => undefined }));
    } finally { console.warn = warn; }
    assert.equal(warned.filter((w) => w.includes('W9 Bodiless')).length, 1, 'said once');
    assert.match(warned[0], /draws the generated symbol/);
  });
});

describe('the cache of a schedule\'s views', () => {
  /** A 1 x 0.2 x 2 m box on the ground, as the mesh of occurrence `expressId`. */
  const BOX: MeshData = (() => {
    const pts: number[] = [];
    for (const [a, b, y] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 2], [1, -1, 2], [1, 1, 2], [-1, 1, 2]]) pts.push(10 + a * 0.5, y, 20 + b * 0.1);
    const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    return { expressId: 5, ifcType: 'IfcWindow', positions: new Float32Array(pts), normals: new Float32Array(pts.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] } as MeshData;
  })();
  const entry: ScheduleEntry = {
    key: 'w', kind: 'window', spec: null, mark: 'W1', name: 'Window', width: 1, height: 2, counts: {}, total: 1,
    occurrences: [{ modelId: 'b', expressId: 5, globalId: 'g', level: 'L', tag: null, number: 1 }],
  };
  const data: ScheduleData = { levels: [], entries: [entry] };
  const geometryResult = { meshes: [BOX], coordinateInfo: { shiftedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 3, z: 40 } } } };
  const models: ScheduleModel[] = [{ modelId: 'b', dataStore: {} as never, view: null, meshesOf: (id) => (id === 5 ? [BOX] : undefined) }];
  const initial = useViewerStore.getState();

  afterEach(() => useViewerStore.setState({ models: initial.models, mutationVersion: initial.mutationVersion }));

  it('hands back the very views it cut while nothing was edited, and cuts again after an edit', async () => {
    useViewerStore.setState({ models: new Map([['b', { id: 'b', idOffset: 0, geometryResult } as never]]), mutationVersion: 7 });
    const first = (await entryViews(data, 50, models)).get('w');
    assert.ok(first, 'the box has views');
    assert.equal((await entryViews(data, 50, models)).get('w'), first, 'the same views, not cut again');
    assert.equal((await entryViews(data, 20, models)).get('w') === first, false, 'another scale is another cut');

    useViewerStore.setState({ mutationVersion: 8 });
    const edited = (await entryViews(data, 50, models)).get('w');
    assert.ok(edited);
    assert.notEqual(edited, first, 'an edit rebuilds: the views were cut again');
    assert.equal((await entryViews(data, 50, models)).get('w'), edited, 'and the new ones are kept');
  });
});

describe('the views of a GPU-instanced window (#581)', () => {
  const BOX_PIECE: MeshData = (() => {
    const pts: number[] = [];
    for (const [a, b, y] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 2], [1, -1, 2], [1, 1, 2], [-1, 1, 2]]) pts.push(10 + a * 0.5, y, 20 + b * 0.1);
    const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    return { expressId: 5, ifcType: 'IfcWindow', positions: new Float32Array(pts), normals: new Float32Array(pts.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] } as MeshData;
  })();
  const entry: ScheduleEntry = {
    key: 'inst', kind: 'window', spec: null, mark: 'W7', name: 'Instanced', width: 1, height: 2, counts: {}, total: 1,
    occurrences: [{ modelId: 'b', expressId: 5, globalId: 'g', level: 'L', tag: null, number: 1 }],
  };
  const data: ScheduleData = { levels: [], entries: [entry] };
  const geometryResult = { meshes: [], coordinateInfo: { shiftedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 3, z: 40 } } } };
  const initial = useViewerStore.getState();
  afterEach(() => useViewerStore.setState({ models: initial.models, mutationViews: initial.mutationViews }));

  it('is cut from its instanced pieces, as the CLI cuts it from the opened model, not drawn as the generated symbol', async () => {
    useViewerStore.setState({ models: new Map([['b', { id: 'b', ifcDataStore: {}, idOffset: 0, visible: true, geometryResult } as never]]), mutationViews: new Map() });
    // No flat mesh: the window's only pieces come from the renderer's instancing, which `loadedScheduleModels` falls back to (as the measured sizes do).
    const views = await entryViews(data, 50, loadedScheduleModels({ instanced: (id) => (id === 5 ? [BOX_PIECE] : undefined) }));
    assert.ok(views.get('inst'), 'the instanced window has model views');
    assert.equal((await entryViews(data, 50, loadedScheduleModels({ instanced: () => undefined }))).size, 0, 'with no pieces anywhere it has none');
  });
});
