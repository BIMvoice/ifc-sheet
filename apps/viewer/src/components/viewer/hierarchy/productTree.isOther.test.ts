/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `AssemblyGeometry.isOther` (#4764) directly, rather than only through
 * `buildTypeTree`/`buildIfcTypeTree`. Those callers only reach `isOther`
 * after `renders` has already said no, and `renders` itself already returns
 * `true` for every physical type while the geometry filter is inert — so the
 * mid-load branch of `isOther` is unreachable through them and needs its own
 * coverage to be provable rather than assumed.
 */

import '@/test/setup-dom.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { IfcDataStore } from '@ifc-lite/parser';
import { makeAssemblyGeometry } from './productTree.js';

const TYPES: Record<number, string> = {
  1: 'IfcBuildingElementProxy', // physical, no shape, no children — the #4764 case
  2: 'IfcGroup',                // not a product-tree class at all
};

function dataStore(): IfcDataStore {
  return {
    relationships: { getRelated: () => [] },
  } as unknown as IfcDataStore;
}

describe('AssemblyGeometry.isOther', () => {
  it('is false while the geometry filter is inert (mid-load) — absence is unanswerable yet', () => {
    const geometry = makeAssemblyGeometry(dataStore(), 'legacy', new Map(), new Set(), false);
    assert.strictEqual(geometry.isOther(TYPES[1], 1, 1), false);
  });

  it('is true for a physical, geometry-less element once geometry is known', () => {
    const geometry = makeAssemblyGeometry(dataStore(), 'legacy', new Map(), new Set(), true);
    assert.strictEqual(geometry.isOther(TYPES[1], 1, 1), true);
  });

  it('is false once the element actually has its own geometry', () => {
    const geometry = makeAssemblyGeometry(dataStore(), 'legacy', new Map(), new Set([1]), true);
    assert.strictEqual(geometry.isOther(TYPES[1], 1, 1), false);
  });

  it('is false for a class that never belongs in a products tree, even with geometry known', () => {
    const geometry = makeAssemblyGeometry(dataStore(), 'legacy', new Map(), new Set(), true);
    assert.strictEqual(geometry.isOther(TYPES[2], 2, 2), false, 'an IfcGroup is excluded outright, never bucketed');
  });
});
