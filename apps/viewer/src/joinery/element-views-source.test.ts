/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store';
import { entryViews, liveMeshes, type MeshSource } from './element-views-source';
import type { ScheduleData, ScheduleEntry } from './schedule-data';

const mesh = (expressId: number): MeshData => ({ expressId, positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), color: [1, 1, 1, 1] }) as MeshData;

describe('the meshes of a schedule occurrence', () => {
  it('are the model\'s own id shifted by its idOffset, as a federated model\'s meshes are', () => {
    useViewerStore.setState({ models: new Map([['b', { id: 'b', idOffset: 1000, geometryResult: { meshes: [mesh(5), mesh(1005), mesh(1005)] } } as never]]) });
    assert.equal(liveMeshes('b', 5).length, 2);
    assert.equal(liveMeshes('b', 6).length, 0);
    assert.equal(liveMeshes('missing', 5).length, 0);
  });
});

describe('the views of a schedule', () => {
  it('leave out, and log once, an entry whose occurrences have no body geometry', async () => {
    const entry: ScheduleEntry = {
      key: 'nobody', kind: 'window', spec: null, mark: 'W9', name: 'Bodiless', width: 1, height: 1, counts: {}, total: 1,
      occurrences: [{ modelId: 'b', expressId: 5, globalId: 'g', level: 'L', tag: null, number: 1 }],
    };
    const data: ScheduleData = { levels: [], entries: [entry] };
    useViewerStore.setState({ models: new Map([['b', { id: 'b', idOffset: 0, geometryResult: { meshes: [], coordinateInfo: { shiftedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } } } } as never]]) });
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => { warned.push(a.join(' ')); };
    try {
      assert.equal((await entryViews(data, 50)).size, 0);
      await entryViews(data, 50);
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
  let reads = 0;
  const source: MeshSource = () => { reads += 1; return [BOX]; };
  const initial = useViewerStore.getState();

  afterEach(() => useViewerStore.setState({ models: initial.models, mutationVersion: initial.mutationVersion }));

  it('hands back the very views it cut while nothing was edited, and cuts again after an edit', async () => {
    useViewerStore.setState({ models: new Map([['b', { id: 'b', idOffset: 0, geometryResult } as never]]), mutationVersion: 7 });
    reads = 0;
    const first = (await entryViews(data, 50, source)).get('w');
    assert.ok(first, 'the box has views');
    assert.equal((await entryViews(data, 50, source)).get('w'), first, 'the same views, not cut again');
    assert.equal((await entryViews(data, 20, source)).get('w') === first, false, 'another scale is another cut');

    useViewerStore.setState({ mutationVersion: 8 });
    const edited = (await entryViews(data, 50, source)).get('w');
    assert.ok(edited);
    assert.notEqual(edited, first, 'an edit rebuilds: the views were cut again');
    assert.equal((await entryViews(data, 50, source)).get('w'), edited, 'and the new ones are kept');
  });
});
