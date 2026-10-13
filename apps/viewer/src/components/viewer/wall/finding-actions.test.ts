/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { Finding } from '@/check/types';
import { wallNav } from './finding-actions.js';
import { useWallNav } from './wall-nav.js';

/** Opening a finding's place on the Wall: the sheet is stepped into with the drawing brought forward; a finding with nowhere to go says so. */

const sheet = { id: 's1', number: 'A-101', name: 'Plans', createdAt: 0, viewports: [{ id: 'vp', viewId: 'v1', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] };
const finding = (extra: Partial<Finding>): Finding => ({ kind: 'planNoDimensions', key: 'check.planNoDimensions', params: {}, ...extra });

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ sheets: [sheet] });
  useWallNav.setState({ stepped: null, focus: null });
});

describe('wallNav', () => {
  it('steps into the sheet that shows the finding\'s drawing and brings the drawing forward', () => {
    assert.equal(wallNav.open(finding({ viewId: 'v1' })), true);
    assert.deepEqual([useWallNav.getState().stepped, useWallNav.getState().focus], ['s1', 'v1']);
  });

  it('steps into the finding\'s own sheet', () => {
    assert.equal(wallNav.open(finding({ kind: 'emptySheet', key: 'check.emptySheet', sheetId: 's1' })), true);
    assert.deepEqual([useWallNav.getState().stepped, useWallNav.getState().focus], ['s1', null]);
  });

  it('has nowhere to go for a drawing that is on no sheet', () => {
    assert.equal(wallNav.open(finding({ viewId: 'gone' })), false);
    assert.equal(useWallNav.getState().stepped, null);
  });
});
