/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** CHECKSET, DRAFTSET and ISSUE are registered commands like DIMALL: named on the command line, run with no tool running and no view in front. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { parseIssueArgs } from '@/issue/run.js';
import { attachDraftingView, cancelCommand, pressEnter, startDraftCommand, submitCommandLine, useDraftingSession } from './session.js';
import { draftCommandByName } from './commands/registry.js';

const history = () => useDraftingSession.getState().history.map((h) => h.key);
const tick = () => new Promise((r) => setTimeout(r, 50));

beforeEach(() => {
  cancelCommand();
  resetProject();
  useViewerStore.setState({ models: new Map(), geometryResult: null } as never);
  useDraftingSession.setState({ history: [], selection: new Set(), lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
});

describe('the set commands are registered', () => {
  it('by name, with the text after ISSUE going to the command', () => {
    assert.deepEqual(['CHECKSET', 'DRAFTSET', 'DRAFT-SET', 'ISSUE'].map((n) => draftCommandByName(n)?.id), ['checkset', 'draftset', 'draftset', 'issue']);
    assert.equal(draftCommandByName('ISSUE')?.takesArgs, true);
    assert.equal(draftCommandByName('DIMALL')?.takesArgs, undefined);
  });

  it('CHECKSET lists what is missing, with no view in front', () => {
    useProjectStore.setState({ sheets: [{ id: 's1', number: 'A-101', name: 'Plans', createdAt: 0, viewports: [] }] as never });
    submitCommandLine('checkset', null);
    assert.deepEqual(history().slice(0, 1), ['check.cmd']);
    assert.ok(history().includes('check.msg.line'));
  });

  it('DRAFTSET says plainly that there is no model to make the set for', () => {
    submitCommandLine('DRAFTSET', null);
    const lines = useDraftingSession.getState().history;
    assert.equal(lines[0].key, 'draftSet.cmd');
    assert.equal(lines[1].key, 'draftSet.msg.line');
  });

  it('ISSUE with nothing on the sheets says so, once the issue module has loaded', async () => {
    submitCommandLine('ISSUE svg P02', null);
    await tick();
    assert.ok(history().includes('issue.msg.nothing'), history().join());
  });

  it('is not repeated by Enter', () => {
    submitCommandLine('ISSUE', null);
    assert.equal(useDraftingSession.getState().lastCommandId, null);
    const before = history().length;
    pressEnter();
    assert.equal(history().length, before);
  });

  it('is not startable by id without a view only when it works on a view', () => {
    assert.equal(startDraftCommand('checkset'), true);
    assert.equal(startDraftCommand('dimall'), false);
  });
});

describe('ISSUE arguments', () => {
  it('are an optional format and the issue name', () => {
    assert.deepEqual(parseIssueArgs(''), { format: 'pdf', name: undefined });
    assert.deepEqual(parseIssueArgs('svg P02 Tender'), { format: 'svg', name: 'P02 Tender' });
    assert.deepEqual(parseIssueArgs('Tender set'), { format: 'pdf', name: 'Tender set' });
  });
});
