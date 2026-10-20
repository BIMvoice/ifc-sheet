/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store';
import { entryViews, liveMeshes } from './element-views-source';
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
