/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { Finding } from '@/check/types';
import { attachDraftingView, cancelCommand, runningCommand, setPlanPartsProvider, setWorkPlaneProvider, startDraftCommand, useDraftingSession } from '@/drafting/session.js';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import type { ProjectView } from '@/project/types';
import { house } from '@/dimall/fixture.js';
import { fixFinding, goToFinding } from './finding-actions.js';
import { useWallNav } from './wall-nav.js';

/** Going to a finding on the Wall: the sheet is stepped into with the drawing brought forward; a finding with nowhere to go says so. */

const sheet = { id: 's1', number: 'A-101', name: 'Plans', createdAt: 0, viewports: [{ id: 'vp', viewId: 'v1', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] };
const finding = (extra: Partial<Finding>): Finding => ({ kind: 'planNoDimensions', key: 'check.planNoDimensions', params: {}, ...extra });

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ sheets: [sheet] });
  useWallNav.setState({ stepped: null, focus: null });
});

describe('goToFinding', () => {
  it('steps into the sheet that shows the finding\'s drawing and brings the drawing forward', () => {
    assert.equal(goToFinding(finding({ viewId: 'v1' })), true);
    assert.deepEqual([useWallNav.getState().stepped, useWallNav.getState().focus], ['s1', 'v1']);
  });

  it('steps into the finding\'s own sheet', () => {
    assert.equal(goToFinding(finding({ kind: 'emptySheet', key: 'check.emptySheet', sheetId: 's1' })), true);
    assert.deepEqual([useWallNav.getState().stepped, useWallNav.getState().focus], ['s1', null]);
  });

  it('has nowhere to go for a drawing that is on no sheet', () => {
    assert.equal(goToFinding(finding({ viewId: 'gone' })), false);
    assert.equal(useWallNav.getState().stepped, null);
  });
});

describe('fixFinding', () => {
  const view = { id: 'v1', kind: 'plan', scale: 100 } as unknown as ProjectView;
  const dims = () => useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension');

  beforeEach(() => {
    cancelCommand();
    clearDraftHistory();
    useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
    attachDraftingView(null, 'down', () => []);
    attachDraftingView('v1', 'down', () => []);
    setWorkPlaneProvider(() => null, () => view);
    setPlanPartsProvider(() => house());
  });

  it('runs the fix while another tool is active, instead of handing its name to that tool', async () => {
    assert.equal(startDraftCommand('line'), true);
    assert.ok(runningCommand(), 'LINE is running');
    assert.equal(await fixFinding(finding({ viewId: 'v1', fix: 'DIMALL' })), true);
    assert.equal(runningCommand(), null, 'the running tool was cancelled');
    assert.ok(dims().length > 20, 'the dimensions were drawn');
    assert.ok(!useDraftingSession.getState().history.some((h) => h.key === 'drafting.msg.invalidInput'), 'no "invalid input"');
  });

  it('says false when the command did not start', async () => {
    assert.equal(startDraftCommand('no-such-command'), false);
    attachDraftingView(null, 'down', () => []);
    assert.equal(startDraftCommand('dimall'), false);
  });
});
