/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemplate } from './label-resolve.js';
import { parseTemplate } from './label-template.js';
import { wall } from './label-fixture.js';

const run = (text: string, missing?: 'empty' | 'question' | 'field', el = wall()) => resolveTemplate(parseTemplate(text), el, 'en', missing);

describe('resolveTemplate', () => {
  it('reads attributes, class, type, material and storey', () => {
    assert.equal(run('{Name} {Tag} {ObjectType} {PredefinedType}'), 'W-01 T7 Basic Wall STANDARD');
    assert.equal(run('{Class}/{IfcClass}'), 'Wall/IfcWall');
    assert.equal(run('{Type.Name} {Material} {Storey}'), 'WT-200 Concrete / Insulation Level 1');
  });
  it('reads a property and a formatted quantity with a unit', () => {
    assert.equal(run('{Pset_WallCommon.FireRating}'), 'EI 60');
    assert.equal(run('{Qto_WallBaseQuantities.Length:0.00 m}'), '4.29 m');
    assert.equal(run('{Pset_WallCommon.IsExternal}'), 'Yes');
  });
  it('reads a length in metres whatever the model\'s length unit, and converts to a unit written after the pattern', () => {
    const mm = wall({ lengthUnitScale: () => 0.001, quantitySets: () => [{ name: 'Qto_WallBaseQuantities', quantities: [{ name: 'Length', value: 4285.7, length: true }, { name: 'NetArea', value: 10.714 }] }] });
    assert.equal(run('{Qto_WallBaseQuantities.Length:0.00 m}', 'question', mm), '4.29 m');
    assert.equal(run('{Qto_WallBaseQuantities.Length:0 mm}', 'question', mm), '4286 mm');
    assert.equal(run('{Qto_WallBaseQuantities.Length:0.0 cm}', 'question', mm), '428.6 cm');
    assert.equal(run('{Qto_WallBaseQuantities.Length:0.0 ft}', 'question', mm), '4.3 ft', 'a unit it does not know is written as given, the value in metres');
    assert.equal(run('{Qto_WallBaseQuantities.NetArea:0.00 m²}', 'question', mm), '10.71 m²', 'an area is taken as stored');
  });
  it('takes the element\'s own value before the type\'s, and the type\'s when the element has none', () => {
    assert.equal(run('{Pset_WallCommon.FireRating}'), 'EI 60');
    assert.equal(run('{Pset_WallCommon.ThermalTransmittance:0.00}'), '0.24');
    assert.equal(run('{Type.Pset_WallCommon.FireRating}'), 'EI 30', 'Type. reads the type only');
    assert.equal(run('{Type.Qto_WallBaseQuantities.Length}', 'empty'), '');
  });
  it('treats an empty value as missing and falls through to the type', () => {
    const el = wall({ propertySets: () => [{ name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: '' }] }] });
    assert.equal(run('{Pset_WallCommon.FireRating}', 'question', el), 'EI 30');
  });
  it('matches set and property names regardless of case', () => {
    assert.equal(run('{pset_wallcommon.firerating}'), 'EI 60');
  });
  it('shows the placeholder asked for where a value is missing', () => {
    assert.equal(run('[{Pset_X.Y}]', 'empty'), '[]');
    assert.equal(run('[{Pset_X.Y}]', 'question'), '[?]');
    assert.equal(run('[{Pset_X.Y}]', 'field'), '[Pset_X.Y]');
    assert.equal(run('[{Pset_X.Y|n/a}]', 'question'), '[n/a]', 'a field fallback wins');
  });
  it('leaves no unit behind a missing value', () => {
    assert.equal(run('{Pset_X.Y:0.00 m}', 'empty'), '');
  });
  it('keeps literal text, line breaks included', () => {
    assert.equal(run('{Name}\n{Qto_WallBaseQuantities.Height:0.0} m'), 'W-01\n2.5 m');
  });
  it('an element with nothing reads as missing everywhere', () => {
    const none = wall({ attribute: () => '', className: () => '', typeName: () => '', propertySets: () => [], quantitySets: () => [], typePropertySets: () => [], materials: () => [], storey: () => '' });
    assert.equal(run('{Name}|{Class}|{Type.Name}|{Material}|{Storey}', 'question', none), '?|?|?|?|?');
  });
});
