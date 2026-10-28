/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Save, open, save is a fixed point (#297): a plan with a section symbol, tags
 * the user moved, and views the app made without an `auto` flag comes back
 * as saved, and what the sync does after the open (it re-settles every
 * leader and every section symbol) finds nothing to change.
 *
 * The session that saved a plan was looking at a plan; the page that opens
 * the file may be looking at nothing, or at an elevation. What is derived
 * must not depend on that, so the test saves looking at the plan and opens
 * with the annotation frame of a fresh page and of an elevation.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setAnnotationScreenUp } from '@/drafting/annotation';
import { clearDraftHistory, newDraft } from '@/drafting/draft-store';
import { attachDraftingView, cancelCommand, clickDrawing, setWorkPlaneProvider, startDraftCommand } from '@/drafting/session';
import { installSectionLink } from '@/drafting/section-link';
import type { AnnotationType } from '@/catalogue/types';
import { ringToRef } from '@/labels/label-leader';
import { refreshParametricLabels } from '@/labels/label-sync';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import type { ProjectDocument, ProjectView } from './types.js';

const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const tagType: AnnotationType = { id: 'at1', name: 'Tag', tool: 'label', label: { template: 'T', missing: 'question', leader: 'always' } };
// A wall outline, drawing units (metres).
const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.2 }, { x: 0, y: 0.2 }];
const TOL = 0.05;

let uninstall: () => void = () => {};
beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  uninstall = installSectionLink();
});
afterEach(() => uninstall());

/** The project a user saves: looking at the plan, a section drawn, tags moved by hand, two of them level with the wall end. */
function savedProject(): ProjectDocument {
  useProjectStore.setState({ views: [planView], annotationTypes: [tagType] });
  attachDraftingView('plan-1', 'down', () => []);
  startDraftCommand('sectionline');
  clickDrawing({ x: 0, y: -4 }, TOL, false);
  clickDrawing({ x: 10, y: -4 }, TOL, false);
  clickDrawing({ x: 5, y: -1 }, TOL, false);
  const tags = [{ x: 2, y: -3 }, { x: 5.3, y: 2.1 }, { x: 8.6, y: -0.7 }, { x: 10.5, y: 0.1 }, { x: -1.5, y: 0.1 }].map((p) =>
    newDraft('plan-1', '0', { type: 'text', p, text: 'T', height: 0.25, rotation: 0, frame: 'box' }, { labelOf: 'G1', atype: 'at1', labelRef: ringToRef(ring) }));
  useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, ...tags] });
  refreshParametricLabels('en');
  return JSON.parse(serializeProject(projectDocument())) as ProjectDocument;
}

/** Open the file `doc` (as written, parsed by the real reader) on a page whose annotation frame is `up`, let the sync run, and return the file it would save. */
function reopened(doc: ProjectDocument, up: 1 | -1): ProjectDocument {
  resetProject();
  setAnnotationScreenUp(up);
  loadProjectDocument(parseProjectFile(JSON.stringify(doc)));
  refreshParametricLabels('en');
  return JSON.parse(serializeProject(projectDocument())) as ProjectDocument;
}

describe('save, open, save is a fixed point (#297)', () => {
  for (const up of [1, -1] as const) {
    it(`the document is deep-equal after an open that starts with screen-up ${up}`, () => {
      const saved = savedProject();
      assert.ok(saved.drafts.some((d) => d.shape.type === 'text' && d.shape.text === 'A'), 'the fixture has a section letter');
      assert.ok(saved.drafts.some((d) => d.shape.type === 'text' && d.shape.text === 'T' && d.shape.leader), 'and tags with leaders');
      const { savedAt: _a, ...want } = saved as ProjectDocument & { savedAt?: string };
      const { savedAt: _b, ...got } = reopened(saved, up) as ProjectDocument & { savedAt?: string };
      assert.deepEqual(got, want);
    });
  }

  it('a view saved without an auto flag is saved without one the second time', () => {
    const doc = savedProject();
    const view = doc.views.find((v) => v.id === 'plan-1');
    assert.ok(view && !('auto' in view), 'the first save has no auto key');
    const again = reopened(doc, -1).views.find((v) => v.id === 'plan-1');
    assert.ok(again && !('auto' in again), 'the second save has none either');
  });
});
