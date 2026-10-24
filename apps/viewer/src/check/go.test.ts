/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Going to a finding and fixing it: one rule for every surface, whatever tool is running. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, runningCommand, setPlanPartsProvider, setWorkPlaneProvider, startDraftCommand, useDraftingSession } from '@/drafting/session.js';
import { EMPTY_VIEW_DRAWING, patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import type { ProjectView } from '@/project/types';
import { house } from '@/dimall/fixture.js';
import { fixFinding, fixOutcome, goToFinding, waitForView, type FindingNav } from './go.js';
import { clearFocus, useFocusRequest } from './focus.js';
import type { Finding } from './types';

const view = { id: 'v1', kind: 'plan', scale: 100 } as unknown as ProjectView;
const finding = (extra: Partial<Finding>): Finding => ({ kind: 'planNoDimensions', key: 'check.planNoDimensions', params: {}, viewId: 'v1', fix: 'DIMALL', ...extra });
const dims = () => useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension');
const nav: FindingNav & { opened: number } = { opened: 0, open() { this.opened++; return true; } };

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useViewDrawings.setState({ byView: { v1: { ...EMPTY_VIEW_DRAWING, status: 'ready' } } });
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('v1', 'down', () => []);
  setWorkPlaneProvider(() => null, () => view);
  setPlanPartsProvider(() => house());
  nav.opened = 0;
});

describe('fixFinding', () => {
  it('runs the fix while another tool is active, instead of handing its name to that tool', async () => {
    assert.equal(startDraftCommand('line'), true);
    assert.ok(runningCommand(), 'LINE is running');
    assert.equal(await fixFinding(finding({}), nav), true);
    assert.equal(runningCommand(), null, 'the running tool was cancelled');
    assert.ok(dims().length > 20, 'the dimensions were drawn');
    assert.ok(!useDraftingSession.getState().history.some((h) => h.key === 'drafting.msg.invalidInput'), 'no "invalid input"');
  });

  it('waits for the drawing to be made before it starts the command', async () => {
    patchViewDrawing('v1', { status: 'generating' });
    setTimeout(() => patchViewDrawing('v1', { status: 'ready' }), 1000);
    const done = fixFinding(finding({}), nav);
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(dims().length, 0, 'it did not run on a drawing that was still being made');
    assert.equal(await done, true);
    assert.ok(dims().length > 20);
  });

  it('says false when there is nothing to fix or nowhere to go', async () => {
    assert.equal(await fixFinding(finding({ fix: undefined }), nav), false);
    assert.equal(await fixFinding(finding({ viewId: undefined }), nav), false);
    assert.equal(await fixFinding(finding({}), { open: () => false }), false);
    assert.equal(dims().length, 0);
  });

  it('says false when the command did not start', () => {
    assert.equal(startDraftCommand('no-such-command'), false);
    attachDraftingView(null, 'down', () => []);
    assert.equal(startDraftCommand('dimall'), false);
  });
});

describe('a drawing that fails to be made', () => {
  it('ends the wait at once, saying why, instead of holding the fix for the full 20 seconds', async () => {
    patchViewDrawing('v1', { status: 'error' });
    const started = Date.now();
    assert.equal(await waitForView('v1', true), 'error');
    assert.equal(await fixOutcome(finding({}), nav), 'drawingFailed');
    assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
    assert.equal(dims().length, 0);
  });

  it('tells apart nothing to fix, nowhere to go and a command that did not start', async () => {
    assert.equal(await fixOutcome(finding({ fix: undefined }), nav), 'noFix');
    assert.equal(await fixOutcome(finding({}), { open: () => false }), 'noPlace');
    assert.equal(await fixOutcome(finding({ fix: 'TAGALL' }), nav), 'done');
  });
});

describe('goToFinding on elements', () => {
  it('asks the drawing to zoom to the elements a finding is about', () => {
    clearFocus();
    goToFinding(finding({ guids: ['G1', 'G2'] }), nav);
    const request = useFocusRequest.getState().request;
    assert.deepEqual([request?.viewId, request?.guids], ['v1', ['G1', 'G2']]);
    clearFocus();
  });

  it('does not, for a finding about an annotation or one with no elements', () => {
    clearFocus();
    goToFinding(finding({ draftId: 'd1', guids: ['G1'] }), nav);
    goToFinding(finding({}), nav);
    assert.equal(useFocusRequest.getState().request, null);
  });
});

describe('goToFinding', () => {
  it('opens the place and selects the annotation once the view is in front', async () => {
    assert.equal(goToFinding(finding({ draftId: 'd1' }), nav), true);
    assert.equal(nav.opened, 1);
    await new Promise((r) => setTimeout(r, 250));
    assert.deepEqual([...useDraftingSession.getState().selection], ['d1']);
  });

  it('has nowhere to go when the surface cannot open it', () => {
    assert.equal(goToFinding(finding({ draftId: 'd1' }), { open: () => false }), false);
    assert.equal(useDraftingSession.getState().selection.size, 0);
  });
});
