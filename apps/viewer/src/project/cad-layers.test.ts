/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cadLayerName, cadRuleOrder, matchCadRule, resolveCadLayer, type CadLayerRule } from './cad-layers.js';
import { isoStarterRules } from './cad-layers-iso.js';
import { aiaStarterRules } from './cad-layers-aia.js';
import { moveRule, patchRule } from './cad-layers-edit.js';
import { VIEW_CATEGORIES } from './view-graphics.js';

const classRule: CadLayerRule = { id: 'c', source: 'CUT', ifcClasses: ['IfcWall'], layer: 'A-WALL-CUT' };
const materialRule: CadLayerRule = { id: 'm', source: 'CUT', ifcClasses: ['IfcWall'], material: 'Beton armat', layer: 'A-WALL-CONC', color: '#ff0000' };
const wall = { source: 'CUT', ifcClass: 'IfcWall' };

describe('CAD layer rules', () => {
  it('try material rules before class rules, whatever the table order', () => {
    // The class rule is first in the table, yet the material rule wins for a wall of that material.
    assert.equal(matchCadRule([classRule, materialRule], { ...wall, material: 'Beton armat' })?.id, 'm');
    assert.equal(matchCadRule([materialRule, classRule], { ...wall, material: 'Beton armat' })?.id, 'm');
    assert.deepEqual(cadRuleOrder([classRule, materialRule]).map((r) => r.id), ['m', 'c']);
  });

  it('fall to the class rule when the material does not match, and to nothing when no class does', () => {
    assert.equal(matchCadRule([classRule, materialRule], { ...wall, material: 'Lemn' })?.id, 'c');
    assert.equal(matchCadRule([classRule, materialRule], { ...wall })?.id, 'c');
    assert.equal(matchCadRule([classRule, materialRule], { source: 'CUT', ifcClass: 'IfcDoor' }), null);
  });

  it('take the first of two rules in the same tier', () => {
    const first: CadLayerRule = { id: 'a', ifcClasses: ['IfcWall'], layer: 'FIRST' };
    const second: CadLayerRule = { id: 'b', ifcClasses: ['IfcWall'], layer: 'SECOND' };
    assert.equal(resolveCadLayer([first, second], wall)?.name, 'FIRST');
    assert.equal(resolveCadLayer([second, first], wall)?.name, 'SECOND');
  });

  it('compare class, material and source without regard to case or spacing', () => {
    const r: CadLayerRule = { id: 'x', source: 'cut', ifcClasses: ['IFCWALL'], material: '  beton   ARMAT', layer: 'L' };
    assert.ok(matchCadRule([r], { source: 'CUT', ifcClass: 'IfcWall', material: 'Beton armat' }));
  });

  it('never match a rule without a criterion, or a criterion the thing lacks', () => {
    assert.equal(matchCadRule([{ id: 'e', layer: 'EVERYTHING' }], wall), null);
    assert.equal(matchCadRule([materialRule], wall), null, 'a material rule needs a material');
    assert.equal(matchCadRule([{ id: 'k', kind: 'dimension', layer: 'D' }], { source: 'Notes' }), null);
    assert.equal(matchCadRule([{ id: 'k', kind: 'dimension', layer: 'D' }], { source: 'Notes', kind: 'dimension' })?.id, 'k');
  });

  it('give the configured pens, and none that the rule leaves out', () => {
    assert.deepEqual(resolveCadLayer([materialRule], { ...wall, material: 'Beton armat' })?.color, '#ff0000');
    const plain = resolveCadLayer([classRule], wall);
    assert.equal(plain?.name, 'A-WALL-CUT');
    assert.equal('color' in (plain ?? {}), false);
    assert.equal(resolveCadLayer([], wall), null, 'an empty table says nothing');
  });
});

describe('CAD layer names', () => {
  it('fold Romanian diacritics to ASCII, deterministically', () => {
    assert.equal(cadLayerName('Pereți-beton ș ț ă'), 'Pereti-beton s t a');
    assert.equal(cadLayerName('ȘȚĂÎÂ'), 'STAIA');
    assert.equal(cadLayerName('Pereți'), cadLayerName('Pereți'));
  });

  it('replace what CAD forbids and what ASCII lacks, and bound the length', () => {
    assert.equal(cadLayerName('A/B:C?D'), 'A_B_C_D');
    assert.equal(cadLayerName('日本'), '__');
    assert.equal(cadLayerName('x'.repeat(300)).length, 255);
    assert.equal(cadLayerName('   '), '');
  });
});

describe('ISO 13567-style starter', () => {
  const rules = isoStarterRules();

  it('has unique rule ids, a criterion on every rule, and names in the mandatory 2+6+2 structure', () => {
    assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
    for (const r of rules) {
      assert.equal(cadLayerName(r.layer), r.layer, r.layer);
      assert.ok(r.source || r.kind, r.id);
      // Agent (2) + element (6, `-` filled) + presentation (2), then an optional `_` field.
      assert.match(r.layer, /^A-[0-9-]{6}[EHDT]-(_[A-Z]{3,4})?$/, r.layer);
      const element = r.layer.slice(2, 8);
      assert.match(element, /^([0-9]+-*|-+)$/, 'digits first, then fill');
      assert.equal(r.layer.slice(0, 10).length, 10);
    }
  });

  it('covers every class the views draw, as cut, seen, hidden and hatch (except classes with no element family)', () => {
    const covered = new Set(rules.flatMap((r) => r.ifcClasses ?? []).map((c) => c.toUpperCase()));
    const drawn = VIEW_CATEGORIES.filter((c) => c.id !== 'other').flatMap((c) => c.classes.map((k) => k.toUpperCase()));
    assert.deepEqual(drawn.filter((c) => !covered.has(c)), []);
    for (const source of ['CUT', 'SEEN', 'HIDDEN', 'HATCH']) {
      assert.equal(resolveCadLayer(rules, { source, ifcClass: 'IfcWallStandardCase' })?.name.startsWith('A-21----'), true, source);
    }
  });

  it('puts a wall cut and a wall seen on different layers, and annotations on theirs', () => {
    assert.equal(resolveCadLayer(rules, { source: 'CUT', ifcClass: 'IfcWall' })?.name, 'A-21----E-_CUT');
    assert.equal(resolveCadLayer(rules, { source: 'SEEN', ifcClass: 'IfcWall' })?.name, 'A-21----E-_SEEN');
    assert.equal(resolveCadLayer(rules, { source: 'HATCH', ifcClass: 'IfcWall' })?.name, 'A-21----H-');
    assert.equal(resolveCadLayer(rules, { source: 'CUT', ifcClass: 'IfcWindow' })?.name, 'A-31----E-_CUT');
    assert.equal(resolveCadLayer(rules, { source: 'Notes', kind: 'dimension' })?.name, 'A-------D-');
    assert.equal(resolveCadLayer(rules, { source: 'Notes', kind: 'text' })?.name, 'A-------T-');
    assert.equal(resolveCadLayer(rules, { source: 'FRAME' }), null, 'the sheet frame keeps its fixed layer');
  });
});

describe('AIA/NCS-style preset', () => {
  it('names walls A-WALL-CUT and A-WALL-SEEN, with unique ids', () => {
    const rules = aiaStarterRules();
    assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
    assert.equal(resolveCadLayer(rules, { source: 'CUT', ifcClass: 'IfcWall' })?.name, 'A-WALL-CUT');
    assert.equal(resolveCadLayer(rules, { source: 'Notes', kind: 'dimension' })?.name, 'A-ANNO-DIMS');
  });
});

describe('editing the table', () => {
  const list: CadLayerRule[] = [{ id: 'a', layer: 'A' }, { id: 'b', layer: 'B' }, { id: 'c', layer: 'C' }];
  it('moves a rule, clamped at the ends', () => {
    assert.deepEqual(moveRule(list, 'c', -1).map((r) => r.id), ['a', 'c', 'b']);
    assert.deepEqual(moveRule(list, 'a', -1).map((r) => r.id), ['a', 'b', 'c']);
    assert.deepEqual(moveRule(list, 'a', 9).map((r) => r.id), ['b', 'c', 'a']);
    assert.deepEqual(moveRule(list, 'zz', 1), list);
  });
  it('patches a rule and removes a key set to undefined', () => {
    const out = patchRule([{ id: 'a', layer: 'A', color: '#000000' }], 'a', { layer: 'Z', color: undefined });
    assert.deepEqual(out, [{ id: 'a', layer: 'Z' }]);
  });
});
