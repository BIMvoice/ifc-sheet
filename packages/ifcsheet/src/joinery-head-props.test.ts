/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The second slice of the joinery configurator (#448): a type's configuration is not found by name or size by another type, the head
 * and the hand-added properties of a type survive the project file, and an added property is a model row (`content.properties`) a schedule can list.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_JOINERY_MAPPING, resolveMapping, type ElementFacts } from './joinery-mapping.js';
import { readJoineryList } from './joinery-spec-read.js';
import { CUSTOM_PSET, cleanCustomProps, customPropNames, customValueOf, fireOf, thermalOf } from './joinery-custom-props.js';
import { modelRowId, modelRowText } from './joinery-model-rows.js';
import { configureTypeOpening, type ProjectJoinery } from './joinery-type-config.js';
import { orderedRows } from './schedule-content.js';

const empty = (): ProjectJoinery => ({ joineryTypes: [], joineryMapping: { ...DEFAULT_JOINERY_MAPPING } });
const opening = { operations: ['side-left' as const], fanlight: false };
const facts = (typeGlobalId: string | null, globalId: string): ElementFacts =>
  ({ kind: 'window', globalId, typeGlobalId, names: ['Fenster'], width: 1, height: 1 });

describe('type identity wins over name and size', () => {
  const p = configureTypeOpening(empty(), { typeGlobalId: 'A', kind: 'window', name: 'Fenster', size: { width: 1, height: 1 }, opening });

  it('the configured type\'s own elements use its mapping', () => {
    expect(resolveMapping(p.joineryMapping, p.joineryTypes, facts('A', 'e1'))).toMatchObject({ source: 'type' });
  });

  it('an element of another type with the same name and size is not matched to it', () => {
    expect(resolveMapping(p.joineryMapping, p.joineryTypes, facts('B', 'e2'))).toBeNull();
    expect(resolveMapping(p.joineryMapping, p.joineryTypes, facts(null, 'e3'))).toBeNull();
  });

  it('an entry of the catalogue that belongs to no type is still found by name', () => {
    const named = { ...p.joineryTypes[0], id: 'W1', mark: 'W1' };
    expect(resolveMapping(DEFAULT_JOINERY_MAPPING, [named], facts('B', 'e2'))).toMatchObject({ source: 'name' });
  });
});

describe('the head of a type', () => {
  const configure = (head?: Parameters<typeof configureTypeOpening>[1]['head']) =>
    configureTypeOpening(empty(), { typeGlobalId: 'A', kind: 'window', name: 'Fenster', size: { width: 1, height: 1.5 }, opening, head });

  it('is kept by the entry, and square removes it', () => {
    const arched = configure({ shape: 'pointed', rise: 0.9 });
    expect(arched.joineryTypes[0].head).toEqual({ shape: 'pointed', rise: 0.9 });
    const again = configureTypeOpening({ joineryTypes: arched.joineryTypes, joineryMapping: arched.joineryMapping }, { typeGlobalId: 'A', kind: 'window', name: 'x', size: { width: 1, height: 1.5 }, opening });
    expect(again.joineryTypes[0].head).toEqual({ shape: 'pointed', rise: 0.9 });
    const square = configureTypeOpening({ joineryTypes: arched.joineryTypes, joineryMapping: arched.joineryMapping }, { typeGlobalId: 'A', kind: 'window', name: 'x', size: { width: 1, height: 1.5 }, opening, head: { shape: 'square' } });
    expect('head' in square.joineryTypes[0]).toBe(false);
  });

  it('is read back from a project file; a damaged head is a square one', () => {
    const [read] = readJoineryList(JSON.parse(JSON.stringify(configure({ shape: 'segmental', rise: 0.2 }).joineryTypes)));
    expect(read.head).toEqual({ shape: 'segmental', rise: 0.2 });
    const cases: [unknown, unknown][] = [
      [{ shape: 'ogee' }, undefined], ['round', undefined], [{ rise: 0.3 }, undefined],
      [{ shape: 'segmental', rise: -1 }, { shape: 'segmental' }], [{ shape: 'round', rise: 0.3 }, { shape: 'round' }],
    ];
    for (const [bad, expected] of cases) {
      const [spec] = readJoineryList([{ ...configure().joineryTypes[0], head: bad }]);
      expect(spec.head).toEqual(expected);
    }
  });
});

describe('properties added by hand', () => {
  const rw = { id: modelRowId('property', CUSTOM_PSET, 'Rw'), source: 'property' as const, psetName: CUSTOM_PSET, propertyName: 'Rw' };
  const custom = [{ name: 'U', value: '1,1', key: 'thermalTransmittance' as const }, { name: 'Rw', value: '32 dB' }, { name: 'Fire', value: 'EI30', key: 'fireRating' as const }];

  it('are cleaned: trimmed, no empty name or value, no repeated name, a key only once', () => {
    expect(cleanCustomProps([
      { name: ' Rw ', value: ' 32 dB ' }, { name: 'rw', value: 'x' }, { name: '', value: 'y' }, { name: 'Z', value: '' },
      { name: 'U1', value: '1', key: 'thermalTransmittance' }, { name: 'U2', value: '2', key: 'thermalTransmittance' },
    ])).toEqual([{ name: 'Rw', value: '32 dB' }, { name: 'U1', value: '1', key: 'thermalTransmittance' }]);
  });

  it('give the schedule\'s own rows a value, and every other name a row of its own', () => {
    const spec = configureTypeOpening(empty(), { typeGlobalId: 'A', kind: 'window', name: 'F', size: { width: 1, height: 1 }, opening, custom }).joineryTypes[0];
    expect(thermalOf(spec)).toBe(1.1);
    expect(fireOf(spec)).toBe('EI30');
    expect(customPropNames([spec])).toEqual(['Rw']);
    expect(customValueOf(spec, rw)).toBe('32 dB');
    expect(customValueOf(spec, { ...rw, psetName: 'Pset_WindowCommon', id: modelRowId('property', 'Pset_WindowCommon', 'Rw') })).toBeUndefined();
    expect(customValueOf(spec, { ...rw, id: modelRowId('property', CUSTOM_PSET, 'U'), propertyName: 'U' })).toBeUndefined();
  });

  it('survive the project file', () => {
    const spec = configureTypeOpening(empty(), { typeGlobalId: 'A', kind: 'window', name: 'F', size: { width: 1, height: 1 }, opening, custom }).joineryTypes[0];
    const [read] = readJoineryList(JSON.parse(JSON.stringify([spec])));
    expect(read.custom).toEqual(custom);
    expect(thermalOf(read)).toBe(1.1);
  });

  it('are model rows of #480: built-ins, then the model rows, then the text rows, and the typed value fills the type\'s cell', () => {
    const ids = orderedRows({ properties: [rw], rows: { hidden: [rw.id] } }, ['t']).map((r) => r);
    expect(ids.map((r) => r.id).slice(-2)).toEqual([rw.id, 'text:t']);
    expect(ids.find((r) => r.id === rw.id)?.shown).toBe(false);
    expect(orderedRows(undefined, ['t']).map((r) => r.id)).not.toContain(rw.id);
    expect(modelRowText({ occurrences: [{ modelValues: { [rw.id]: '32 dB' } }] }, rw.id)).toBe('32 dB');
  });
});
