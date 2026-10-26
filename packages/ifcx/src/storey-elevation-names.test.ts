/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nodeName } from './names.js';
import { IDENTITY, worldMatrix, worldZ } from './placement.js';
import type { ComposedNode } from './types.js';

const node = (attributes: Record<string, unknown>, inherits?: Record<string, string>): ComposedNode =>
  ({ path: 'p', attributes: new Map(Object.entries(attributes)), children: new Map(), inherits }) as ComposedNode;

describe('nodeName: an occurrence keeps its own name over its type\'s', () => {
  const type = { 'bsi::ifc::prop::TypeName': 'WT01' };
  it('an occurrence is named by its edge, the type name only fills in when it has none', () => {
    assert.equal(nodeName(node(type, { windowType: 't' }), ['Window']), 'Window');
    assert.equal(nodeName(node(type, { windowType: 't' }), []), 'WT01');
  });
  it('a type node is still named by its TypeName', () => {
    assert.equal(nodeName(node(type), []), 'WT01');
  });
  it('an own Name beats the edge', () => {
    assert.equal(nodeName(node({ ...type, 'bsi::ifc::prop::Name': 'W-1' }, { windowType: 't' }), ['Window']), 'W-1');
  });
  it('drops the uniqueness suffix only when the unsuffixed sibling exists', () => {
    const w = node(type, { windowType: 't' });
    assert.equal(nodeName(w, ['Window_001'], new Set(['Window', 'Window_001'])), 'Window');
    assert.equal(nodeName(w, ['Room_101'], new Set(['Room_101'])), 'Room_101');
    assert.equal(nodeName(w, ['Window_001'], new Set(['Window_001'])), 'Window_001');
  });
});

describe('worldMatrix', () => {
  it('chains the translations down the spatial path', () => {
    const at = (z: number) => node({ 'usd::xformop': { transform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, z, 1]] } });
    assert.equal(worldZ(worldMatrix(at(1.5), worldMatrix(at(2), IDENTITY))), 3.5);
    assert.equal(worldZ(worldMatrix(node({}), IDENTITY)), 0);
  });
});
