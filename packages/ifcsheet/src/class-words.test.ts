/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #602: the quantities by type and the material takeoff named IFC classes in English inside Romanian tables (Wall, Door,
 * "Wall (fără tip)"). They now go through `classLabel`: Romanian words in Romanian, the IFC name in English and for a class
 * the table does not list.
 */

import { describe, expect, it } from 'vitest';
import { CLASS_WORDS_RO, classLabel } from './class-words.js';
import { layoutMaterialTakeoff, takeoffTable } from './material-takeoff-layout.js';
import { layoutTypeQuantities, typeQuantityLines, typeQuantityTable } from './type-quantities-layout.js';
import { takeoffLabelsOf, takeoffSayFor } from './takeoff-words.js';
import { typeLabelsOf, typesSayFor } from './type-quantities-words.js';
import { typeQuantities, type TypeElement } from './type-quantities.js';
import type { SchedulePrim } from './schedule-prim.js';

const element = (className: string, typeName: string | null): TypeElement => ({ className, typeClass: typeName ? `${className}Type` : null, typeName, level: 'P', elevation: 0, length: 1, area: 2, volume: 3 });
const ELEMENTS = [element('IfcWall', null), element('IfcDoor', null), element('IfcWindow', 'W1'), element('IfcSlab', null), element('IfcFlowTerminal', null)];
const textsOf = (prims: readonly SchedulePrim[]): string[] => prims.flatMap((p) => ('text' in p && typeof p.text === 'string' ? [p.text] : []));

describe('classLabel', () => {
  it('says the Romanian word in Romanian, the IFC name in English, and the IFC name for a class it does not list', () => {
    expect(['IfcWall', 'IfcDoor', 'IfcWindow', 'IfcSlab', 'IfcCovering'].map((c) => classLabel(c, 'ro'))).toEqual(['Perete', 'Ușă', 'Fereastră', 'Planșeu', 'Finisaj']);
    expect(['IfcWall', 'IfcDoor', 'IfcStairFlight'].map((c) => classLabel(c, 'en'))).toEqual(['Wall', 'Door', 'StairFlight']);
    expect(classLabel('IfcFlowTerminal', 'ro')).toBe('FlowTerminal');
    expect(classLabel('IfcDoor', 'ro-RO')).toBe('Ușă');
  });

  it('has a Romanian word, with comma-below diacritics only, for every class it lists', () => {
    const rows = Object.entries(CLASS_WORDS_RO);
    expect(rows.length).toBeGreaterThan(20);
    for (const [, word] of rows) {
      expect(word.length).toBeGreaterThan(2);
      expect(word).not.toMatch(/[şţŞŢ]/);
    }
  });
});

describe('the tables in Romanian', () => {
  const data = typeQuantities(ELEMENTS);
  const romanian = typeLabelsOf(typesSayFor('ro'), 'ro', 'Cantități pe tipuri');
  const english = typeLabelsOf(typesSayFor('en'), 'en', 'Quantities by type');

  it('the quantities by type print the class and the untyped type cell in Romanian', () => {
    const lines = typeQuantityLines(data, romanian);
    expect(lines.map((l) => l.type).filter((t) => t.includes('(fără tip)')).sort()).toEqual(['FlowTerminal (fără tip)', 'Perete (fără tip)', 'Planșeu (fără tip)', 'Ușă (fără tip)']);
    expect(lines.map((l) => l.className)).toContain('IfcDoor');
    const painted = textsOf(layoutTypeQuantities(data, romanian).prims);
    expect(painted).toEqual(expect.arrayContaining(['Perete', 'Ușă', 'Fereastră', 'Planșeu']));
    expect(painted).not.toContain('Door');
    expect(painted).not.toContain('Wall');
  });

  it('the CSV and XLSX keep the IFC name in the class column, in Romanian too', () => {
    expect(typeQuantityTable(data, romanian).rows.map((r) => r[1])).toEqual(expect.arrayContaining(['Wall', 'Door', 'Window', 'Slab', 'FlowTerminal']));
    expect(takeoffTable([{ material: 'Beton', elements: 1, volume: 1, area: 1, classes: ['IfcWall'] }], takeoffLabelsOf(takeoffSayFor('ro'), 'ro', 'T')).rows[0][4]).toBe('Wall');
  });

  it('the quantities by type are unchanged in English', () => {
    const table = typeQuantityTable(data, english);
    expect(table.rows.map((r) => r[1])).toEqual(expect.arrayContaining(['Wall', 'Door', 'Window', 'Slab']));
    expect(typeQuantityLines(data, english).map((l) => l.type)).toContain('Wall (no type)');
  });

  it('the material takeoff prints "used in" in Romanian, and in English as before', () => {
    const rows = [{ material: 'Beton', elements: 3, volume: 3, area: 2, classes: ['IfcRoof', 'IfcSlab', 'IfcCovering', 'IfcWall'] }];
    const ro = takeoffLabelsOf(takeoffSayFor('ro'), 'ro', 'Extras de materiale');
    const en = takeoffLabelsOf(takeoffSayFor('en'), 'en', 'Material takeoff');
    expect(textsOf(layoutMaterialTakeoff(rows, ro).prims)).toContain('Acoperiș, Planșeu, Finisaj, Perete');
    expect(takeoffTable(rows, en).rows[0][4]).toBe('Roof, Slab, Covering, Wall');
    expect(textsOf(layoutMaterialTakeoff(rows, en).prims)).toContain('Roof, Slab, Covering, Wall');
  });
});
