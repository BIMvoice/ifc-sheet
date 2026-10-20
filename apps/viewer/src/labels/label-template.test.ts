/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFieldRef, parseTemplate, templateFields } from './label-template.js';

describe('parseFieldRef', () => {
  it('knows the attributes in any case', () => {
    assert.deepEqual(parseFieldRef('Name'), { kind: 'attribute', name: 'Name' });
    assert.deepEqual(parseFieldRef('objecttype'), { kind: 'attribute', name: 'ObjectType' });
    assert.deepEqual(parseFieldRef('Class'), { kind: 'class', withPrefix: false });
    assert.deepEqual(parseFieldRef('IfcClass'), { kind: 'class', withPrefix: true });
  });
  it('reads Set.Prop as a property and Type.* as the type', () => {
    assert.deepEqual(parseFieldRef('Pset_WallCommon.FireRating'), { kind: 'property', set: 'Pset_WallCommon', name: 'FireRating', from: 'any' });
    assert.deepEqual(parseFieldRef('Type.Name'), { kind: 'typeName' });
    assert.deepEqual(parseFieldRef('Type.Pset_X.Y'), { kind: 'property', set: 'Pset_X', name: 'Y', from: 'type' });
  });
  it('refuses what is not a field', () => {
    for (const p of ['', 'Nonsense', 'A.B.C', 'Type.Foo', 'A..B', '.B']) assert.equal(parseFieldRef(p), null, p);
  });
});

describe('parseTemplate', () => {
  it('keeps literal text around fields', () => {
    const t = parseTemplate('Wall {Name} ({Pset_WallCommon.FireRating})');
    assert.deepEqual(t.segments.map((s) => (s.type === 'text' ? s.text : `<${s.source}>`)), ['Wall ', '<Name>', ' (', '<Pset_WallCommon.FireRating>', ')']);
    assert.deepEqual(t.issues, []);
  });
  it('reads format and unit, and the fallback after a bar', () => {
    const [f] = templateFields(parseTemplate('{Qto_WallBaseQuantities.Length:0.00 m|n/a}'));
    assert.deepEqual(f.format, { decimals: 2, thousands: false, unit: 'm' });
    assert.equal(f.fallback, 'n/a');
    const [g] = templateFields(parseTemplate('{Name|}'));
    assert.equal(g.fallback, '', 'an empty fallback means show nothing');
    assert.equal(templateFields(parseTemplate('{Name}'))[0].fallback, undefined);
  });
  it('breaks lines at a real line break and at \\n', () => {
    assert.deepEqual(parseTemplate('A\\nB\nC').segments, [{ type: 'text', text: 'A\nB\nC' }]);
  });
  it('writes escaped braces, bars and backslashes literally', () => {
    assert.deepEqual(parseTemplate('\\{Name\\} \\\\ \\|').segments, [{ type: 'text', text: '{Name} \\ |' }]);
  });
  it('keeps what it cannot read as literal text and reports it', () => {
    const open = parseTemplate('A {Name');
    assert.deepEqual(open.segments, [{ type: 'text', text: 'A {Name' }]);
    assert.deepEqual(open.issues.map((i) => i.kind), ['unclosed']);
    const bad = parseTemplate('{Nonsense} {} {Name}');
    assert.deepEqual(bad.issues.map((i) => i.kind), ['unknown', 'empty']);
    assert.equal(templateFields(bad).length, 1);
    assert.equal(bad.segments[0].type === 'text' && bad.segments[0].text, '{Nonsense} {} ');
  });
  it('an empty template has no segments', () => {
    assert.deepEqual(parseTemplate(''), { segments: [], issues: [] });
  });
});
