/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Classification mapping (#89): the one resolver and what feeds it. Every code in these tests is an EXAMPLE made up for the test: IfcSheet ships no
 * Uniclass or OmniClass table.
 */

import { describe, expect, it } from 'vitest';
import {
  classificationOf, classifiedTypes, mappingsFor, parseClassificationRows, readClassificationMapping, readClassificationMappings, withRule,
  type ClassificationMapping, type ClassificationModel, type ClassifiedElement,
} from './classification.js';
import type { BoqElement } from './boq-compute.js';
import { readScheduleClassification, readSchedule } from './sub-reports.js';

const mapping = (rules: ClassificationMapping['rules'], system: ClassificationMapping['system'] = { name: 'Uniclass', edition: '2015' }): ClassificationMapping => ({ id: 'm1', system, rules });
const RULES = mapping([
  { by: 'class', match: 'IfcWall', code: 'EXAMPLE-C-WALL', title: 'EXAMPLE: walls by class' },
  { by: 'material', match: 'Concrete', code: 'EXAMPLE-M-CONC' },
  { by: 'type', match: 'T240', code: 'EXAMPLE-T-240', title: 'EXAMPLE: wall T240' },
  { by: 'class', match: 'IfcDoor', code: 'EXAMPLE-C-DOOR' },
]);
const wall: ClassifiedElement = { className: 'IfcWallStandardCase', typeName: 'T240', materials: ['Concrete'], modelId: 'a', expressId: 1 };
const noModel: ClassificationModel = { referencesOf: () => [] };
const modelWith = (...refs: { system?: string; identification?: string; name?: string; unresolved?: boolean }[]): ClassificationModel => ({ referencesOf: () => refs });

describe('classificationOf', () => {
  it('speaks for the most specific rule: type, then material, then class', () => {
    expect(classificationOf(wall, [RULES], noModel)).toMatchObject({ code: 'EXAMPLE-T-240', title: 'EXAMPLE: wall T240', source: 'mapping' });
    expect(classificationOf({ ...wall, typeName: 'T300' }, [RULES], noModel)?.code).toBe('EXAMPLE-M-CONC');
    expect(classificationOf({ ...wall, typeName: null, materials: [] }, [RULES], noModel)?.code).toBe('EXAMPLE-C-WALL');
    expect(classificationOf({ className: 'IfcSlab' }, [RULES], noModel)).toBeNull();
  });

  it('compares class, type and material names as a person means them: a standard case is its class, case and spacing do not matter', () => {
    expect(classificationOf({ className: 'IFCDOOR' }, [RULES])?.code).toBe('EXAMPLE-C-DOOR');
    expect(classificationOf({ className: 'IfcWall', typeName: '  t240 ' }, [RULES])?.code).toBe('EXAMPLE-T-240');
  });

  it('the MODEL wins over the mapping: an element that carries an IfcClassificationReference keeps that code', () => {
    const got = classificationOf(wall, [RULES], modelWith({ system: 'Uniclass 2015', identification: 'Ss_25_10', name: 'Wall systems' }));
    expect(got).toEqual({ code: 'Ss_25_10', title: 'Wall systems', source: 'model', system: 'Uniclass 2015' });
  });

  it('a reference that names no system is the model\'s code for the mapping being resolved; one of another system is not', () => {
    expect(classificationOf(wall, [RULES], modelWith({ identification: '000', name: 'Allgemeines' }))?.source).toBe('model');
    expect(classificationOf(wall, [RULES], modelWith({ system: 'OmniClass', identification: '23-13' }))).toMatchObject({ source: 'mapping', code: 'EXAMPLE-T-240' });
    // With no mapping at all the model's reference is all there is, whatever its system.
    expect(classificationOf(wall, [], modelWith({ system: 'OmniClass', identification: '23-13' }))).toMatchObject({ source: 'model', code: '23-13' });
  });

  it('skips a reference that is unreadable or has no identification and uses the next', () => {
    const got = classificationOf(wall, [RULES], modelWith({ unresolved: true }, { name: 'Only a name' }, { identification: ' Pr_20 ' }));
    expect(got).toMatchObject({ code: 'Pr_20', source: 'model' });
  });

  it('the first mapping with a rule answers; mappingsFor picks one by id', () => {
    const other = { ...mapping([{ by: 'class', match: 'IfcWall', code: 'EXAMPLE-OTHER' }], { name: 'OmniClass' }), id: 'm2' };
    expect(classificationOf({ className: 'IfcWall' }, [other, RULES])?.code).toBe('EXAMPLE-OTHER');
    expect(mappingsFor([RULES, other], 'm2')).toEqual([other]);
    expect(mappingsFor([RULES, other], undefined)).toEqual([]);
    expect(mappingsFor([RULES], 'gone')).toEqual([]);
  });
});

describe('what a project file holds', () => {
  it('reads a mapping, dropping a rule without a target or a code and a mapping without a system', () => {
    const read = readClassificationMappings([
      { id: 'a', system: { name: ' Uniclass ', edition: '2015' }, rules: [{ by: 'type', match: 'T1', code: 'X' }, { by: 'roof', match: 'T1', code: 'X' }, { by: 'class', match: '', code: 'X' }, { by: 'class', match: 'IfcWall', code: '' }, 7] },
      { id: 'b', system: {}, rules: [] }, { system: { name: 'x' } }, 'junk',
    ]);
    expect(read).toEqual([{ id: 'a', system: { name: 'Uniclass', edition: '2015' }, rules: [{ by: 'type', match: 'T1', code: 'X' }] }]);
    expect(readClassificationMapping(null)).toBeNull();
    expect(readClassificationMappings(undefined)).toEqual([]);
  });

  it('withRule sets, replaces in place and removes (an empty code)', () => {
    const one = withRule(RULES, 'type', ' t240 ', 'EXAMPLE-NEW', 'EXAMPLE: new');
    expect(one.rules.filter((r) => r.by === 'type')).toEqual([{ by: 'type', match: 't240', code: 'EXAMPLE-NEW', title: 'EXAMPLE: new' }]);
    expect(one.rules.length).toBe(RULES.rules.length);
    expect(one.rules[2].code).toBe('EXAMPLE-NEW');
    expect(withRule(RULES, 'type', 'T240', '  ').rules.some((r) => r.by === 'type')).toBe(false);
    expect(withRule(RULES, 'material', 'Brick', 'EXAMPLE-B').rules.at(-1)).toEqual({ by: 'material', match: 'Brick', code: 'EXAMPLE-B' });
  });

  it('a quantities-by-type schedule keeps its classification choice; other kinds drop it', () => {
    expect(readScheduleClassification({ mapping: 'm1', group: true })).toEqual({ mapping: 'm1', group: true });
    expect(readScheduleClassification({})).toEqual({});
    expect(readScheduleClassification('x')).toBeUndefined();
    expect(readSchedule({ id: 's', kind: 'types', classification: { mapping: 'm1', group: true } })?.classification).toEqual({ mapping: 'm1', group: true });
    expect(readSchedule({ id: 's', kind: 'materials', classification: { mapping: 'm1' } })?.classification).toBeUndefined();
  });
});

describe('the CSV import', () => {
  const csv = (...rows: string[][]): ReturnType<typeof parseClassificationRows> => parseClassificationRows(rows);

  it('takes code, title and one of class, type, material per row, in English or Romanian headers', () => {
    const out = csv(['Code', 'Title', 'Class', 'Type', 'Material'], ['EX-1', 'EXAMPLE one', 'IfcWall', '', ''], ['EX-2', '', '', 'T240', ''], ['EX-3', 'EXAMPLE three', '', '', 'Concrete']);
    expect(out.problems).toEqual([]);
    expect(out.rules).toEqual([
      { by: 'class', match: 'IfcWall', code: 'EX-1', title: 'EXAMPLE one' }, { by: 'type', match: 'T240', code: 'EX-2' }, { by: 'material', match: 'Concrete', code: 'EX-3', title: 'EXAMPLE three' },
    ]);
    expect(csv(['Cod', 'Titlu', 'Clasă'], ['EX-9', 'Titlu', 'IfcDoor']).rules).toEqual([{ by: 'class', match: 'IfcDoor', code: 'EX-9', title: 'Titlu' }]);
  });

  it('reports every row it does not take, with its row number, and takes the rest', () => {
    const out = csv(
      ['code', 'title', 'class', 'type', 'material'],
      ['EX-1', '', 'IfcWall', '', ''], // row 2: fine
      ['', '', 'IfcSlab', '', ''], // row 3: no code
      ['EX-3', '', '', '', ''], // row 4: no target
      ['EX-4', '', 'IfcBeam', 'T9', ''], // row 5: two targets
      ['EX-5', '', 'Wall', '', ''], // row 6: not an IFC class
      ['EX-6', '', 'IFCWALL', '', ''], // row 7: the same class again
      ['', '', '', '', ''], // blank: skipped, not a problem
      ['EX-8', '', '', 'T1', ''], // row 9: fine
    );
    expect(out.rules.map((r) => r.code)).toEqual(['EX-1', 'EX-8']);
    expect(out.problems).toEqual([
      { row: 3, kind: 'missingCode', detail: 'IfcSlab' }, { row: 4, kind: 'noTarget' }, { row: 5, kind: 'manyTargets', detail: 'IfcBeam / T9' },
      { row: 6, kind: 'badClass', detail: 'Wall' }, { row: 7, kind: 'duplicate', detail: 'IFCWALL' },
    ]);
  });

  it('refuses a file without a code column or without any target column, rather than reading nothing quietly', () => {
    expect(csv(['title', 'class'], ['x', 'IfcWall']).problems).toEqual([{ row: 0, kind: 'noCodeColumn' }]);
    expect(csv(['code', 'title'], ['EX', 'x']).problems).toEqual([{ row: 0, kind: 'noTargetColumn' }]);
    expect(csv().problems.map((p) => p.kind)).toEqual(['noCodeColumn', 'noTargetColumn']);
  });
});

describe('classifiedTypes', () => {
  const el = (patch: Partial<BoqElement>): BoqElement => ({
    modelId: 'a', expressId: 1, globalId: 'g', name: 'n', ifcClass: 'IfcWallStandardCase', predefinedType: null, typeClass: 'IfcWallType', typeName: 'T240', level: 'L0', materials: [], properties: [], quantities: [], ...patch,
  });
  it('groups the elements by type and code, the typed first, and says where each code came from', () => {
    const model: ClassificationModel = { referencesOf: (e) => (e.expressId === 3 ? [{ identification: 'MODEL-1', name: 'From the model' }] : []) };
    const rows = classifiedTypes([el({ expressId: 1 }), el({ expressId: 2 }), el({ expressId: 3 }), el({ expressId: 4, ifcClass: 'IfcSlab', typeClass: null, typeName: null })], [RULES], model);
    expect(rows).toEqual([
      { className: 'IfcWallType', typeName: 'T240', code: 'EXAMPLE-T-240', title: 'EXAMPLE: wall T240', source: 'mapping', count: 2 },
      { className: 'IfcWallType', typeName: 'T240', code: 'MODEL-1', title: 'From the model', source: 'model', count: 1 },
      { className: 'IfcSlab', typeName: null, code: '', title: '', source: 'none', count: 1 },
    ]);
  });
});
