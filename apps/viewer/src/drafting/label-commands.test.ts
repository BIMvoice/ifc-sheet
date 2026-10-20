/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** LABEL and LABELALL without what they need say so and draw nothing. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from './draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, patchDraftSettings, pressEnter, runningCommand, setElementPicker, setViewElementsProvider, startDraftCommand, submitCommandLine, useDraftingSession } from './session.js';

const last = () => useDraftingSession.getState().history.at(-1)?.key;

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
  patchDraftSettings({ annotationType: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
  setElementPicker(null);
  setViewElementsProvider(null);
});

describe('LABEL', () => {
  it('asks for a label type when none is current, and finishes', () => {
    setElementPicker(() => 5);
    startDraftCommand('label');
    clickDrawing({ x: 1, y: 1 }, 0.05, false);
    assert.equal(last(), 'drafting.msg.labelNeedsType');
    assert.equal(runningCommand(), null);
    assert.equal(useProjectStore.getState().drafts.length, 0);
  });
  it('does not take another tool\'s type for a label type', () => {
    useProjectStore.setState({ annotationTypes: [{ id: 'at1', name: 'Lead', tool: 'leader' }] });
    patchDraftSettings({ annotationType: { id: 'at1', tool: 'leader' } });
    setElementPicker(() => 5);
    startDraftCommand('label');
    clickDrawing({ x: 1, y: 1 }, 0.05, false);
    assert.equal(last(), 'drafting.msg.labelNeedsType');
  });
  it('says so when there is no model element under the click', () => {
    useProjectStore.setState({ annotationTypes: [{ id: 'at1', name: 'W', tool: 'label', label: { template: '{Name}', missing: 'question' } }] });
    patchDraftSettings({ annotationType: { id: 'at1', tool: 'label' } });
    startDraftCommand('label');
    clickDrawing({ x: 1, y: 1 }, 0.05, false);
    assert.equal(last(), 'drafting.msg.notAnElement');
    assert.ok(runningCommand(), 'it waits for another click');
  });
});

describe('LABELALL', () => {
  it('says no elements are drawn when the view has none', () => {
    startDraftCommand('labelall');
    pressEnter();
    assert.equal(last(), 'drafting.msg.labelAllEmpty');
  });
  it('refuses a class that is not in the view', () => {
    startDraftCommand('labelall');
    submitCommandLine('IfcWall', null);
    assert.equal(last(), 'drafting.msg.labelAllClass');
  });
});
