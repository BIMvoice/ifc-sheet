/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { matchesPropertyFilter } from './property-filter-match.js';
import type { QueryFilterLike } from './selector/to-query-descriptor.js';

function filter(over: Partial<QueryFilterLike> = {}): QueryFilterLike {
  return { psetName: 'Pset_WallCommon', propName: 'FireRating', operator: '=', value: '2HR', ...over };
}

describe('matchesPropertyFilter', () => {
  it('matches a property in the only property set carrying that name', () => {
    const props = [{ name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: '2HR' }] }];
    expect(matchesPropertyFilter(props, filter())).toBe(true);
  });

  it('is any-match across two distinct same-named property sets (#3490)', () => {
    // Type-level Pset_WallCommon carries a different value; occurrence-level carries the match.
    const props = [
      { name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: '1HR' }] },
      { name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: '2HR' }] },
    ];
    expect(matchesPropertyFilter(props, filter())).toBe(true);
  });

  it('returns false when no property set carries the name at all', () => {
    expect(matchesPropertyFilter([], filter())).toBe(false);
  });

  it('returns false when the named property set exists but the value does not match', () => {
    const props = [{ name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: '1HR' }] }];
    expect(matchesPropertyFilter(props, filter())).toBe(false);
  });

  it('exists operator is true once the property is found, regardless of value', () => {
    const props = [{ name: 'Pset_WallCommon', properties: [{ name: 'FireRating', value: null }] }];
    expect(matchesPropertyFilter(props, filter({ operator: 'exists' }))).toBe(true);
  });

  it('falls back to quantity sets when no property set matches psetName (Qto_ / #4091)', () => {
    const qtoFilter = filter({ psetName: 'Qto_WallBaseQuantities', propName: 'NetVolume', operator: '>', value: 1 });
    const qsets = [{ name: 'Qto_WallBaseQuantities', quantities: [{ name: 'NetVolume', value: 12.5 }] }];
    expect(matchesPropertyFilter([], qtoFilter, qsets)).toBe(true);
  });

  it('returns false for a Qto_ filter when the quantity is absent too', () => {
    const qtoFilter = filter({ psetName: 'Qto_WallBaseQuantities', propName: 'NetVolume', operator: '>', value: 1 });
    expect(matchesPropertyFilter([], qtoFilter, [])).toBe(false);
  });
});
