/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LabelElement, PropertySetLike } from '@/labels/label-resolve';
import { factsOf, loadBearingOf } from './discipline-facts';

/** LoadBearing is read the way the labels read a property: own sets first, then the type's. */

const sets = (name: string, value: unknown): PropertySetLike[] => [{ name, properties: [{ name: 'LoadBearing', value }] }];
const element = (own: PropertySetLike[], type: PropertySetLike[] = [], cls = 'IfcWall', predefined = ''): Pick<LabelElement, 'className' | 'attribute' | 'propertySets' | 'typePropertySets'> => ({
  className: () => cls,
  attribute: (name) => (name === 'PredefinedType' ? predefined : ''),
  propertySets: () => own,
  typePropertySets: () => type,
});

describe('loadBearingOf', () => {
  it('reads the common property set of the element', () => {
    assert.equal(loadBearingOf(element(sets('Pset_WallCommon', true))), true);
    assert.equal(loadBearingOf(element(sets('Pset_BeamCommon', false))), false);
    assert.equal(loadBearingOf(element(sets('Pset_SlabCommon', 'TRUE'))), true);
    assert.equal(loadBearingOf(element(sets('Pset_ColumnCommon', '.F.'))), false);
  });

  it('is null without the property, with an unreadable value, or in a set that is not a common one', () => {
    assert.equal(loadBearingOf(element([])), null);
    assert.equal(loadBearingOf(element(sets('Pset_WallCommon', undefined))), null);
    assert.equal(loadBearingOf(element(sets('Pset_WallCommon', 'maybe'))), null);
    assert.equal(loadBearingOf(element(sets('Custom_Structure', true))), null);
  });

  it('falls back to the type\'s property, and the element\'s own wins over it', () => {
    assert.equal(loadBearingOf(element([], sets('Pset_WallCommon', true))), true);
    assert.equal(loadBearingOf(element(sets('Pset_WallCommon', false), sets('Pset_WallCommon', true))), false);
  });
});

describe('factsOf', () => {
  it('upper-cases the class and the predefined type and carries the relations given', () => {
    const f = factsOf(element(sets('Pset_SlabCommon', true), [], 'IfcSlab', 'Roof'), 2.7, 'IfcRoof', { className: 'IfcSlab', predefinedType: 'Roof' });
    assert.deepEqual(f, {
      className: 'IFCSLAB', predefinedType: 'ROOF', loadBearing: true, storeyElevation: 2.7, aggregateClass: 'IFCROOF', hostClass: 'IFCSLAB', hostPredefinedType: 'ROOF',
    });
  });

  it('has no host and no aggregate by default', () => {
    const f = factsOf(element([]), null, '', null);
    assert.equal(f.aggregateClass, '');
    assert.equal(f.hostClass, '');
    assert.equal(f.storeyElevation, null);
  });
});
