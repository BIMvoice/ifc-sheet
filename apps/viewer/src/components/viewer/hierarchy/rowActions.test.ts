/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hierarchyRowActions } from './rowActions';
import type { TreeNode } from './types';

const node = (type: string, expressIds = [7]): TreeNode => ({ type, expressIds, modelIds: ['m'] } as unknown as TreeNode);

describe('hierarchyRowActions', () => {
  it('offers a room its interior elevations, and nothing else that kind', () => {
    assert.deepEqual(hierarchyRowActions(node('IfcSpace'), true), ['isolate', 'interiorElevations']);
    assert.deepEqual(hierarchyRowActions(node('IfcSpace'), false), ['interiorElevations']);
    assert.deepEqual(hierarchyRowActions(node('IfcWall'), true), ['isolate']);
    assert.deepEqual(hierarchyRowActions(node('IfcBuildingStorey'), true), ['solo', 'filter']);
    assert.deepEqual(hierarchyRowActions(node('model-header'), true), []);
  });
});
