/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #653: after a section is drawn the command line must point at something the
 * edition has. IfcSheet has no Project Navigator, so its line names the sheet's
 * "Place on this sheet" list; the full app keeps the Navigator wording.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setEditionForTests } from '@/edition';
import { resolve } from '@/i18n/registry';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { clearDraftHistory } from './draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, setWorkPlaneProvider, startDraftCommand, useDraftingSession } from './session.js';

const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ views: [planView] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView('plan-1', 'down', () => []);
});

afterEach(() => {
  cancelCommand();
  setEditionForTests(null);
});

function lastLineAfterSection(): string {
  startDraftCommand('sectionline');
  clickDrawing({ x: 0, y: 0 }, 0.05, false);
  clickDrawing({ x: 10, y: 0 }, 0.05, false);
  clickDrawing({ x: 5, y: 3 }, 0.05, false);
  const last = useDraftingSession.getState().history.at(-1);
  assert.ok(last, 'the command said something');
  return resolve(last.key, last.params);
}

describe('the line after drawing a section (#653)', () => {
  it('IfcSheet does not mention a Project Navigator and names the place list', () => {
    setEditionForTests('docs');
    const line = lastLineAfterSection();
    assert.ok(!line.includes('Project Navigator'), line);
    assert.ok(line.includes('Place on this sheet'), line);
  });

  it('the full app keeps pointing at its Project Navigator', () => {
    setEditionForTests('full');
    assert.ok(lastLineAfterSection().includes('Project Navigator'));
  });
});
