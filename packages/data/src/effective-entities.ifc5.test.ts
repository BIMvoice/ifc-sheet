/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { iterateEffectiveEntities, type EffectiveEntitySource } from './effective-entities.js';

const TYPES: Record<number, string> = { 1: 'IfcSpace', 2: 'IfcWall', 3: 'IfcSpace' };
const entities = { expressId: new Uint32Array([1, 2, 3]), getTypeName: (id: number) => TYPES[id] ?? 'Unknown' };
const emptyIndex = { byType: new Map<string, number[]>(), byId: new Map<number, { type: string }>() };

describe('the effective entity set of an IFCX store (#184)', () => {
  it('walks the entity table when there is no STEP type index: an IFCX model has spaces', () => {
    const ifcx: EffectiveEntitySource = { entityIndex: emptyIndex, entities, schemaVersion: 'IFC5' };
    expect([...iterateEffectiveEntities(ifcx, null, ['IFCSPACE'])].map((e) => e.expressId)).toEqual([1, 3]);
  });

  it('leaves a store that has a type index to the index, and any other format with no index empty', () => {
    const step: EffectiveEntitySource = {
      entityIndex: { byType: new Map([['IFCSPACE', [1]]]), byId: new Map([[1, { type: 'IFCSPACE' }]]) },
      entities,
      schemaVersion: 'IFC4',
    };
    expect([...iterateEffectiveEntities(step, null, ['IFCSPACE'])].map((e) => e.expressId)).toEqual([1]);
    expect([...iterateEffectiveEntities({ entityIndex: emptyIndex, entities, schemaVersion: 'IFC4' }, null, ['IFCSPACE'])]).toEqual([]);
  });
});
