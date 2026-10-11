/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { selectorToQueryDescriptor, SelectorUnsupportedError } from './to-query-descriptor.js';

describe('selectorToQueryDescriptor', () => {
  it('translates a class union and exact-name Pset/Qto comparisons across every mapped operator', () => {
    const result = selectorToQueryDescriptor(
      'IfcWall, IfcSlab, Pset_WallCommon.FireRating=2HR, Pset_WallCommon.IsExternal!=TRUE, ' +
        'Qto_WallBaseQuantities.NetVolume>1, Qto_WallBaseQuantities.NetVolume>=1, ' +
        'Qto_WallBaseQuantities.NetVolume<10, Qto_WallBaseQuantities.NetVolume<=10, ' +
        'Pset_WallCommon.Reference*=ACME, Pset_WallCommon.LoadBearing=/^TRUE$/, ' +
        'Pset_WallCommon.Status!=NULL',
    );

    expect(result.types).toContain('IfcWall');
    expect(result.types).toContain('IfcSlab');
    expect(result.filters).toEqual(
      expect.arrayContaining([
        { psetName: 'Pset_WallCommon', propName: 'FireRating', operator: '=', value: '2HR' },
        { psetName: 'Pset_WallCommon', propName: 'IsExternal', operator: '!=', value: 'TRUE' },
        { psetName: 'Qto_WallBaseQuantities', propName: 'NetVolume', operator: '>', value: '1' },
        { psetName: 'Qto_WallBaseQuantities', propName: 'NetVolume', operator: '>=', value: '1' },
        { psetName: 'Qto_WallBaseQuantities', propName: 'NetVolume', operator: '<', value: '10' },
        { psetName: 'Qto_WallBaseQuantities', propName: 'NetVolume', operator: '<=', value: '10' },
        { psetName: 'Pset_WallCommon', propName: 'Reference', operator: 'contains', value: 'ACME' },
        { psetName: 'Pset_WallCommon', propName: 'LoadBearing', operator: 'matches', value: '^TRUE$' },
        { psetName: 'Pset_WallCommon', propName: 'Status', operator: 'exists' },
      ]),
    );
  });

  /**
   * The rejection side of the fixture, per this repo's "make fixtures
   * capable of failing" rule: `parent=` has no target in a QueryDescriptor
   * (no relationship-walking concept exists there), so it must throw a
   * SelectorUnsupportedError naming the construct rather than silently
   * dropping it or matching nothing.
   */
  it('rejects a construct with no lossless QueryDescriptor target (parent=)', () => {
    expect(() => selectorToQueryDescriptor('IfcWall, parent=Building')).toThrow(SelectorUnsupportedError);
    try {
      selectorToQueryDescriptor('IfcWall, parent=Building');
      expect.fail('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SelectorUnsupportedError);
      const unsupported = err as SelectorUnsupportedError;
      expect(unsupported.constructs).toHaveLength(1);
      expect(unsupported.constructs[0]).toContain('parent=Building');
    }
  });

  it('rejects a regular-expression property-set NAME (no exact-string target)', () => {
    expect(() => selectorToQueryDescriptor('/Pset_.*Common/.FireRating=2HR')).toThrow(SelectorUnsupportedError);
  });

  it('rejects "!*=" (not-contains — no ComparisonOp target)', () => {
    expect(() => selectorToQueryDescriptor('Pset_WallCommon.Reference!*=ACME')).toThrow(SelectorUnsupportedError);
  });

  it('rejects "!" class negation', () => {
    expect(() => selectorToQueryDescriptor('! IfcWall')).toThrow(SelectorUnsupportedError);
  });

  it('rejects a "+" group union', () => {
    expect(() => selectorToQueryDescriptor('IfcWall + IfcDoor')).toThrow(SelectorUnsupportedError);
  });

  it('rejects a bare GlobalId term', () => {
    expect(() => selectorToQueryDescriptor('325Q7Fhnf67OZC$$r43uzK')).toThrow(SelectorUnsupportedError);
  });

  it('re-throws a genuine parse error with the parser\'s own message', () => {
    expect(() => selectorToQueryDescriptor('IfcWall.')).toThrow(/failed to parse/);
  });

  it('rejects "= NULL" (not-exists — no ComparisonOp target)', () => {
    expect(() => selectorToQueryDescriptor('Pset_WallCommon.Status=NULL')).toThrow(SelectorUnsupportedError);
  });

  it('leaves class terms unexpanded so each backend can expand them for its model schema', () => {
    const result = selectorToQueryDescriptor('IfcWall');
    expect(result.types).toEqual(['IfcWall']);
    expect(result.filters).toEqual([]);
  });
});
