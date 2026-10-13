/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** DIMALL as a command: dimensions that are ordinary, stamped, added once, one undo step, and figures that do not collide. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store.js';
import { attachDraftingView, cancelCommand, setPlanPartsProvider, setWorkPlaneProvider, submitCommandLine, useDraftingSession } from '@/drafting/session.js';
import type { ProjectView } from '@/project/types';
import { figureLifts } from './apply.js';
import { house } from './fixture.js';

const view = { id: 'view-1', kind: 'plan', scale: 100 } as unknown as ProjectView;
const dims = () => useProjectStore.getState().drafts.filter((d) => d.shape.type === 'dimension');

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  setWorkPlaneProvider(() => null, () => view);
  setPlanPartsProvider(() => house());
});

describe('DIMALL', () => {
  it('adds ordinary dimensions, each stamped, and a second run adds nothing', () => {
    submitCommandLine('DIMALL', null);
    const first = dims().length;
    assert.ok(first > 20, String(first));
    assert.ok(dims().every((d) => typeof d.params.dimAll === 'string' && d.shape.type === 'dimension' && d.shape.variant === 'aligned'));
    submitCommandLine('DIMALL', null);
    assert.equal(dims().length, first);
  });

  it('adds again only what was deleted', () => {
    submitCommandLine('DIMALL', null);
    const all = dims().length;
    useProjectStore.setState({ drafts: useProjectStore.getState().drafts.slice(1) });
    submitCommandLine('DIMALL', null);
    assert.equal(dims().length, all);
  });

  it('is one undo step', () => {
    submitCommandLine('DIMALL', null);
    assert.ok(dims().length > 0);
    assert.ok(undoDrafts());
    assert.equal(dims().length, 0);
  });

  it('refuses a view that is not a plan', () => {
    setWorkPlaneProvider(() => null, () => ({ ...view, kind: 'section' }) as unknown as ProjectView);
    submitCommandLine('DIMALL', null);
    assert.equal(dims().length, 0);
  });
});

describe('figureLifts', () => {
  it('leaves a figure that fits on the line and lifts the ones that do not, apart from each other', () => {
    const lifts = figureLifts([{ start: 0, end: 4, width: 1 }, { start: 4, end: 4.3, width: 1 }, { start: 4.3, end: 4.6, width: 1 }, { start: 4.6, end: 8, width: 1 }], 0.25);
    assert.deepEqual(lifts, [0, 1.3, -1.5, 0]);
  });
});
