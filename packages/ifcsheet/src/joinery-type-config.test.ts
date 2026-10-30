/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Configuring a door or window type from its overall size (#448): the opening becomes one catalogue entry, the type is mapped to it,
 * and the entry and the mapping survive a project file round trip and still resolve every element of the type at its own size.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_JOINERY_MAPPING, fitToElement, readJoineryMapping, resolveMapping, type ElementFacts } from './joinery-mapping.js';
import { readJoineryList } from './joinery-spec-read.js';
import {
  FANLIGHT_SHARE, cleanOpening, configureTypeOpening, openingOfSpec, specFromOpening, typeEntryId, typedSillOf, type ProjectJoinery,
} from './joinery-type-config.js';

const DOUBLE_TILT_TURN = { operations: ['tilt-turn-left', 'tilt-turn-right'] as const, fanlight: false };
const empty = (): ProjectJoinery => ({ joineryTypes: [], joineryMapping: { ...DEFAULT_JOINERY_MAPPING } });
const window_ = (typeGlobalId: string | null, width: number, height: number, globalId = 'e1'): ElementFacts =>
  ({ kind: 'window', globalId, typeGlobalId, names: ['Fenster'], width, height });

describe('a type configured from its overall size', () => {
  it('a double tilt-turn is two leaves, each with its operation, at the IFC size', () => {
    const spec = specFromOpening('window', { width: 1.76, height: 1.01 }, { ...DOUBLE_TILT_TURN, operations: [...DOUBLE_TILT_TURN.operations] });
    expect(spec.width).toBe(1.76);
    expect(spec.height).toBe(1.01);
    expect(spec.columns).toEqual([1, 1]);
    expect(spec.rows).toEqual([1]);
    expect(spec.panels.map((p) => [p.col, p.row, p.operation])).toEqual([[0, 0, 'tilt-turn-left'], [1, 0, 'tilt-turn-right']]);
  });

  it('claims no thermal value: the IFC gave none', () => {
    const spec = specFromOpening('window', { width: 1, height: 1 }, { operations: ['fixed'], fanlight: false });
    expect(spec.props.thermalTransmittance).toBeUndefined();
  });

  it('a fanlight is a fixed row over all the leaves, above them', () => {
    const spec = specFromOpening('door', { width: 1.8, height: 2.5 }, { operations: ['swing-left', 'swing-right'], fanlight: true });
    expect(spec.rows).toEqual([1 - FANLIGHT_SHARE, FANLIGHT_SHARE]);
    expect(spec.panels.at(-1)).toEqual({ col: 0, row: 1, colSpan: 2, operation: 'fixed' });
  });

  it('is made valid: 1 to 6 leaves, only what the kind offers', () => {
    expect(cleanOpening('window', { operations: Array(8).fill('side-left'), fanlight: false }).operations).toHaveLength(6);
    expect(cleanOpening('window', { operations: [], fanlight: false }).operations).toEqual(['fixed']);
    expect(cleanOpening('door', { operations: ['tilt-turn-left'], fanlight: false }).operations).toEqual(['fixed']);
    expect(cleanOpening('window', { operations: ['swing-left'], fanlight: false }).operations).toEqual(['fixed']);
  });

  it('is read back from the entry it made', () => {
    for (const opening of [
      { operations: ['sliding-left', 'sliding-right', 'fixed'], fanlight: true },
      { operations: ['top-hung'], fanlight: false },
    ] as const) {
      const spec = specFromOpening('window', { width: 2, height: 1.4 }, { operations: [...opening.operations], fanlight: opening.fanlight });
      expect(openingOfSpec(spec)).toEqual({ operations: [...opening.operations], fanlight: opening.fanlight });
    }
  });

  it('is not read back from an entry of another shape', () => {
    const spec = specFromOpening('window', { width: 2, height: 1.4 }, { operations: ['fixed', 'fixed'], fanlight: false });
    expect(openingOfSpec({ ...spec, columns: [1, 1, 1, 1, 1, 1, 1] })).toBeNull();
    expect(openingOfSpec({ ...spec, rows: [1, 1, 1] })).toBeNull();
  });
});

describe('configureTypeOpening', () => {
  const input = { typeGlobalId: 'TYPE-A', kind: 'window' as const, name: 'Zwei Panele', size: { width: 1.76, height: 1.01 }, opening: { operations: [...DOUBLE_TILT_TURN.operations], fanlight: false } };

  it('adds the entry and maps the type to it, leaving the inputs alone', () => {
    const before = empty();
    const snapshot = JSON.stringify(before);
    const out = configureTypeOpening(before, input);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(out.entryId).toBe(typeEntryId('TYPE-A'));
    expect(out.joineryTypes).toHaveLength(1);
    expect(out.joineryTypes[0]).toMatchObject({ id: out.entryId, kind: 'window', name: 'Zwei Panele', mark: 'W1' });
    expect(out.joineryMapping.types).toEqual({ 'TYPE-A': out.entryId });
  });

  it('every element of the type resolves to it, at its own size; another type of another size does not', () => {
    const out = configureTypeOpening(empty(), input);
    for (const [guid, w, h] of [['e1', 1.76, 1.01], ['e2', 1.2, 1.4]] as const) {
      const match = resolveMapping(out.joineryMapping, out.joineryTypes, window_('TYPE-A', w, h, guid));
      expect(match?.source).toBe('type');
      const drawn = fitToElement(match!.entry, { width: w, height: h });
      expect([drawn.width, drawn.height]).toEqual([w, h]);
      expect(drawn.panels.map((p) => p.operation)).toEqual(['tilt-turn-left', 'tilt-turn-right']);
    }
    expect(resolveMapping(out.joineryMapping, out.joineryTypes, window_('TYPE-B', 0.6, 0.6))).toBeNull();
  });

  it('configuring again edits the same entry and keeps its mark and what the user changed besides', () => {
    const first = configureTypeOpening(empty(), input);
    const edited = first.joineryTypes.map((e) => ({ ...e, mark: 'F1', colors: { ...e.colors, frame: '#123456' } }));
    const again = configureTypeOpening({ ...first, joineryTypes: edited }, { ...input, opening: { operations: ['fixed', 'bottom-hung', 'fixed'], fanlight: false } });
    expect(again.joineryTypes).toHaveLength(1);
    expect(again.joineryTypes[0]).toMatchObject({ mark: 'F1', colors: { frame: '#123456' } });
    expect(again.joineryTypes[0].panels.map((p) => p.operation)).toEqual(['fixed', 'bottom-hung', 'fixed']);
  });

  it('a second type takes the next free mark', () => {
    const first = configureTypeOpening(empty(), input);
    const second = configureTypeOpening(first, { ...input, typeGlobalId: 'TYPE-B', name: 'Other' });
    expect(second.joineryTypes.map((e) => e.mark)).toEqual(['W1', 'W2']);
    expect(second.joineryMapping.types).toEqual({ 'TYPE-A': typeEntryId('TYPE-A'), 'TYPE-B': typeEntryId('TYPE-B') });
  });

  it('survives the project file: written, read back, it still draws the same leaves', () => {
    const out = configureTypeOpening(empty(), input);
    const file = JSON.parse(JSON.stringify({ joineryTypes: out.joineryTypes, joineryMapping: out.joineryMapping })) as Record<string, unknown>;
    const types = readJoineryList(file.joineryTypes);
    const mapping = readJoineryMapping(file.joineryMapping);
    const match = resolveMapping(mapping, types, window_('TYPE-A', 1.76, 1.01));
    expect(match?.source).toBe('type');
    expect(openingOfSpec(match!.entry)).toEqual({ operations: ['tilt-turn-left', 'tilt-turn-right'], fanlight: false });
  });

  it('a window\'s sill is the one given, kept when none is given again, and a door has none', () => {
    const first = configureTypeOpening(empty(), { ...input, sillHeight: 1.1 });
    expect(first.joineryTypes[0].sillHeight).toBe(1.1);
    const again = configureTypeOpening({ joineryTypes: first.joineryTypes, joineryMapping: first.joineryMapping }, input);
    expect(again.joineryTypes[0].sillHeight).toBe(1.1);
    const bad = configureTypeOpening({ joineryTypes: first.joineryTypes, joineryMapping: first.joineryMapping }, { ...input, sillHeight: -2 });
    expect(bad.joineryTypes[0].sillHeight).toBe(1.1);
    const door = configureTypeOpening(empty(), { ...input, typeGlobalId: 'TYPE-D', kind: 'door', opening: { operations: ['swing-left'], fanlight: false }, sillHeight: 1.1 });
    expect(door.joineryTypes[0].sillHeight).toBe(0);
  });

  it('a sill typed as the default is typed; null makes it not stated; an entry saved without the flag reads typed only off the default', () => {
    const at900 = configureTypeOpening(empty(), { ...input, sillHeight: 0.9 });
    expect(typedSillOf(at900.joineryTypes[0])).toBe(0.9);
    const kept = configureTypeOpening({ joineryTypes: at900.joineryTypes, joineryMapping: at900.joineryMapping }, input);
    expect(typedSillOf(kept.joineryTypes[0])).toBe(0.9);
    const blank = configureTypeOpening({ joineryTypes: at900.joineryTypes, joineryMapping: at900.joineryMapping }, { ...input, sillHeight: null });
    expect(typedSillOf(blank.joineryTypes[0])).toBeNull();
    expect(blank.joineryTypes[0].sillTyped).toBeUndefined();
    const { sillTyped: _t, ...legacy } = at900.joineryTypes[0];
    expect(typedSillOf(legacy)).toBeNull();
    expect(typedSillOf({ ...legacy, sillHeight: 1.1 })).toBe(1.1);
  });
});

describe('leaves, a second row and glazing bars of a type (#448)', () => {
  const input = { typeGlobalId: 'TYPE-R', kind: 'window' as const, name: 'Reihe', size: { width: 3, height: 1.5 } };

  it('five leaves and an opening transom row are read back from the entry they made', () => {
    const opening = { operations: Array(5).fill('side-left') as 'side-left'[], fanlight: true, fanlightOpens: true as const, bars: { horizontal: 1, vertical: 2 } };
    const out = configureTypeOpening(empty(), { ...input, opening });
    const entry = out.joineryTypes[0];
    expect(entry.columns).toHaveLength(5);
    expect(entry.panels.filter((p) => p.row === 1).map((p) => p.operation)).toEqual(Array(5).fill('top-hung'));
    expect(openingOfSpec(entry)).toEqual(opening);
  });

  it('a fixed transom row reads back fixed, an old two-row entry still reads as a fanlight', () => {
    const fixed = specFromOpening('window', { width: 2, height: 1.4 }, { operations: ['fixed', 'fixed'], fanlight: true });
    expect(openingOfSpec(fixed)).toEqual({ operations: ['fixed', 'fixed'], fanlight: true });
    expect(openingOfSpec({ ...fixed, panels: fixed.panels.filter((p) => p.row === 0) })).toEqual({ operations: ['fixed', 'fixed'], fanlight: true });
  });

  it('the transom row opens only if there is a row, and only in a window', () => {
    expect(cleanOpening('window', { operations: ['fixed'], fanlight: false, fanlightOpens: true }).fanlightOpens).toBeUndefined();
    expect(cleanOpening('door', { operations: ['swing-left'], fanlight: true, fanlightOpens: true }).fanlightOpens).toBeUndefined();
    expect(cleanOpening('window', { operations: ['fixed'], fanlight: true, fanlightOpens: true }).fanlightOpens).toBe(true);
  });

  it('bars are whole counts of 0 to 5; none at all is no bars', () => {
    const bars = (b: { horizontal: number; vertical: number }) => cleanOpening('window', { operations: ['fixed'], fanlight: false, bars: b }).bars;
    expect(bars({ horizontal: 7, vertical: 1.4 })).toEqual({ horizontal: 5, vertical: 1 });
    expect(bars({ horizontal: -2, vertical: Number.NaN })).toBeUndefined();
    expect(cleanOpening('window', { operations: ['fixed'], fanlight: false }).bars).toBeUndefined();
  });

  it('configuring again with no bars removes them; without the field an entry has none', () => {
    const base = { ...input, opening: { operations: ['fixed' as const], fanlight: false } };
    const withBars = configureTypeOpening(empty(), { ...base, opening: { ...base.opening, bars: { horizontal: 1, vertical: 1 } } });
    expect(withBars.joineryTypes[0].glazingBars).toEqual({ horizontal: 1, vertical: 1 });
    const cleared = configureTypeOpening(withBars, base);
    expect('glazingBars' in cleared.joineryTypes[0]).toBe(false);
    expect('glazingBars' in specFromOpening('window', input.size, base.opening)).toBe(false);
  });

  it('survives the project file', () => {
    const out = configureTypeOpening(empty(), { ...input, opening: { operations: ['fixed', 'fixed', 'fixed', 'fixed'], fanlight: false, bars: { horizontal: 3, vertical: 0 } } });
    const read = readJoineryList(JSON.parse(JSON.stringify(out.joineryTypes)))[0];
    expect(read.columns).toHaveLength(4);
    expect(read.glazingBars).toEqual({ horizontal: 3, vertical: 0 });
  });
});
