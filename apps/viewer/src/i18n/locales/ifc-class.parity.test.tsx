/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #602: IFC class names in Romanian. The app's labels and the engine's tables (what `ifcsheet build` prints and what the
 * quantities by type and the takeoff print on a sheet) say a class with the same words, row by row, and a sheet worded
 * through the app reads the same as the one the command line words.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_WORDS_RO, classLabel, typeLabelsOf, typeQuantities, typeQuantityLines, typeQuantityTable, typesSayFor, type TypeElement } from '@bimvoice/ifcsheet';
import { en, type TranslationKey } from '../en';
import ro from './ro';
import { ifcClassRo } from '../catalogues/ifc-class.ro';

/** Each app label that names an IFC class, with the class (no `Ifc`) the engine's table words it by. */
const ROWS: ReadonlyArray<readonly [TranslationKey, keyof typeof CLASS_WORDS_RO, string?]> = [
  ['drafting.bim.wall', 'Wall'], ['drafting.bim.slab', 'Slab'], ['drafting.bim.column', 'Column'], ['drafting.bim.beam', 'Beam'],
  ['drafting.bim.door', 'Door'], ['drafting.bim.window', 'Window'], ['drafting.bim.opening', 'OpeningElement'], ['drafting.bim.stair', 'Stair'],
  ['drafting.bim.railing', 'Railing'], ['drafting.bim.curtainWall', 'CurtainWall'], ['drafting.bim.roof', 'Roof'], ['drafting.bim.room', 'Space'],
  ['drafting.bim.kind.railing', 'Railing'], ['drafting.bim.kind.slab', 'Slab'],
  ['bulkPropertyEditor.type.wall', 'Wall'], ['bulkPropertyEditor.type.wallStandard', 'WallStandardCase', ' (standard)'], ['bulkPropertyEditor.type.door', 'Door'],
  ['bulkPropertyEditor.type.window', 'Window'], ['bulkPropertyEditor.type.slab', 'Slab'], ['bulkPropertyEditor.type.column', 'Column'], ['bulkPropertyEditor.type.beam', 'Beam'],
  ['bulkPropertyEditor.type.roof', 'Roof'], ['bulkPropertyEditor.type.stair', 'Stair'], ['bulkPropertyEditor.type.railing', 'Railing'],
  ['bulkPropertyEditor.type.curtainWall', 'CurtainWall'], ['bulkPropertyEditor.type.covering', 'Covering'], ['bulkPropertyEditor.type.plate', 'Plate'],
  ['bulkPropertyEditor.type.member', 'Member'], ['bulkPropertyEditor.type.furniture', 'Furniture'], ['bulkPropertyEditor.type.proxy', 'BuildingElementProxy'],
  ['bulkPropertyEditor.type.space', 'Space'], ['bulkPropertyEditor.type.opening', 'OpeningElement'],
];

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');

describe('IFC class names, the app and the engine', () => {
  it('every app label that names a class says it with the engine\'s Romanian word', () => {
    assert.ok(ROWS.length >= 30, 'the table has rows');
    for (const [key, cls, suffix = ''] of ROWS) {
      assert.equal((ro as Record<string, unknown>)[key], `${CLASS_WORDS_RO[cls]}${suffix}`, `${key} (${cls})`);
      assert.equal(classLabel(`Ifc${cls}`, 'ro'), CLASS_WORDS_RO[cls]);
    }
  });

  it('the English label of a class is its IFC name where it has one to match, so nothing else claims a different word', () => {
    for (const [key, cls] of ROWS) {
      const label = (en as Record<string, unknown>)[key];
      assert.equal(typeof label, 'string', key);
      if (['OpeningElement', 'BuildingElementProxy', 'Space'].includes(cls)) continue;
      assert.ok(squash(label as string).startsWith(squash(cls.replace(/StandardCase$/, ''))) || squash(label as string) === squash(cls), `${key}: "${label}" vs ${cls}`);
    }
  });

  it('no label of the catalogue is left without Romanian: all of its keys are served', () => {
    const keys = Object.keys(ifcClassRo);
    assert.ok(keys.length >= 30);
    for (const key of keys) assert.ok(Object.hasOwn(ro, key) && typeof (ro as Record<string, unknown>)[key] === 'string', key);
    for (const [key] of ROWS) assert.ok(Object.hasOwn(ifcClassRo, key), `${key} is in ifc-class.ro.ts`);
  });

  it('the quantities by type word a class the same whether the app\'s catalogue or the command line\'s table says the labels', () => {
    const elements: TypeElement[] = ['IfcWall', 'IfcDoor', 'IfcWindow', 'IfcSlab', 'IfcCovering'].map((className) => ({ className, typeClass: null, typeName: null, level: 'P', elevation: 0, length: 1, area: 2, volume: 3 }));
    const data = typeQuantities(elements);
    const fromCli = typeQuantityTable(data, typeLabelsOf(typesSayFor('ro'), 'ro', 'Cantități pe tipuri'));
    const fromApp = typeQuantityTable(data, typeLabelsOf((key, params) => String(((ro as Record<string, unknown>)[key] ?? '').toString().replace(/\{(\w+)\}/g, (w, n: string) => String(params?.[n] ?? w))), 'ro', 'Cantități pe tipuri'));
    assert.deepEqual(fromApp.rows, fromCli.rows);
    assert.ok(fromCli.rows.length >= 5, 'rows');
    assert.deepEqual([...new Set(fromCli.rows.map((r) => r[1]))].sort(), ['Door', 'Wall', 'Window', 'Slab', 'Covering'].sort(), 'the file keeps the IFC names');
    const lines = typeQuantityLines(data, typeLabelsOf(typesSayFor('ro'), 'ro', 'T'));
    assert.deepEqual(lines.filter((l) => !l.total).map((l) => l.type).sort(), ['Finisaj (fără tip)', 'Fereastră (fără tip)', 'Perete (fără tip)', 'Planșeu (fără tip)', 'Ușă (fără tip)'].sort());
  });
});
