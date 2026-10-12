/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listFields } from './label-fields.js';
import { resolveTemplate } from './label-resolve.js';
import { parseTemplate, templateFields } from './label-template.js';
import { wall } from './label-fixture.js';

describe('listFields', () => {
  const groups = listFields(wall());
  const tokens = groups.flatMap((g) => g.fields.map((f) => f.token));

  it('lists what the element has: attributes with a value, its sets, its type\'s sets', () => {
    assert.deepEqual(groups.map((g) => [g.id, g.title]), [['element', null], ['properties', 'Pset_WallCommon'], ['quantities', 'Qto_WallBaseQuantities'], ['type', 'Pset_WallCommon']]);
    assert.ok(tokens.includes('{Name}') && tokens.includes('{Type.Name}') && tokens.includes('{Material}') && tokens.includes('{Storey}'));
    assert.ok(tokens.includes('{Pset_WallCommon.FireRating}'));
    assert.ok(tokens.includes('{Type.Pset_WallCommon.ThermalTransmittance:0.00}'));
  });
  it('leaves out attributes and properties without a value', () => {
    assert.ok(!tokens.includes('{Description}'), 'Description is empty');
    assert.ok(!tokens.includes('{Pset_WallCommon.Note}'), 'an empty property');
  });
  it('suggests a pattern for a fractional quantity and none for text', () => {
    assert.ok(tokens.includes('{Qto_WallBaseQuantities.Length:0.00}'));
    const whole = wall({ quantitySets: () => [{ name: 'Qto_X', quantities: [{ name: 'Count', value: 3 }] }] });
    assert.ok(listFields(whole).flatMap((g) => g.fields).some((f) => f.token === '{Qto_X.Count}'), 'a whole number needs none');
    assert.ok(tokens.includes('{Pset_WallCommon.FireRating}'));
  });
  it('gives each field the value it reads now', () => {
    const length = groups.flatMap((g) => g.fields).find((f) => f.token.startsWith('{Qto_WallBaseQuantities.Length'));
    assert.equal(length?.sample, '4.286');
  });
  it('every token it offers parses and reads a value for that element', () => {
    for (const token of tokens) {
      const t = parseTemplate(token);
      assert.equal(t.issues.length, 0, token);
      assert.equal(templateFields(t).length, 1, token);
      assert.notEqual(resolveTemplate(t, wall(), 'empty'), '', token);
    }
  });
  it('skips names a template cannot write', () => {
    const el = wall({ propertySets: () => [{ name: 'Pset.Odd', properties: [{ name: 'A', value: 1 }] }, { name: 'Pset_OK', properties: [{ name: 'B|C', value: 1 }, { name: 'D', value: 2 }] }] });
    const found = listFields(el).flatMap((g) => g.fields.map((f) => f.token));
    assert.ok(found.includes('{Pset_OK.D}') && !found.some((t) => t.includes('Odd') || t.includes('B|C')));
  });
});
