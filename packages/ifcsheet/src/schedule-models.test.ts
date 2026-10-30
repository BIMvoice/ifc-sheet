/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #581: the engine's fill of `ScheduleModel` from an opened model. The app's fill is compared with it on FZK in the viewer's `schedule-model-parity.fzk.test.ts`. */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';
import { scheduleModelsOf } from './schedule-models.js';

const mesh = (expressId: number, geometryClass?: number): MeshData => ({ expressId, geometryClass, positions: new Float32Array(9), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), color: [1, 1, 1, 1] }) as MeshData;
const store = {} as IfcDataStore;

describe('scheduleModelsOf', () => {
  it('is one model, with its name and no edit overlay', () => {
    const [model, ...rest] = scheduleModelsOf({ dataStore: store, meshes: [] }, 'house.ifc', 'm1');
    expect(rest).toEqual([]);
    expect(model).toMatchObject({ modelId: 'm1', name: 'house.ifc', view: null });
    expect(model.dataStore).toBe(store);
    expect(typeof model.listProvider).toBe('function');
  });

  it('reads an element\'s meshes by express id, never an instancing template\'s', () => {
    const [model] = scheduleModelsOf({ dataStore: store, meshes: [mesh(5), mesh(5), mesh(6, 2), mesh(7)] });
    expect(model.meshesOf!(5)).toHaveLength(2);
    expect(model.meshesOf!(6)).toBeUndefined();
    expect(model.meshesOf!(7)).toHaveLength(1);
    expect(model.meshesOf!(8)).toBeUndefined();
  });

  it('has no mesh read for a model opened without geometry', () => {
    expect(scheduleModelsOf({ dataStore: store })[0].meshesOf).toBeUndefined();
  });
});
