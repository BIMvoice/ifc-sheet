/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The switch of the coloured style (#499): per view, over a template that may carry it, kept in the project file, one undo step.
 */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewGraphics } from '@bimvoice/ifcsheet';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { parseProjectFile, serializeProject } from './project-file';
import { projectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import { startDrawingSet } from './drawing-set-actions';
import { applyViewTemplate, overrideCount, resetViewOverrides, saveViewAsTemplate, setViewColouredSurfaces } from './view-template-actions';
import type { ProjectView } from './types';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const state = () => useProjectStore.getState();
const elevations = () => state().views.filter((v) => v.kind === 'elevation');
const viewOf = (id: string): ProjectView => state().views.find((v) => v.id === id)!;
const coloured = (id: string) => !!resolveViewGraphics(viewOf(id), state().viewTemplates)?.colouredSurfaces;

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }]);
  startDrawingSet(null, bounds);
  clearDraftHistory();
});

describe('the coloured style is a per-view switch (#499)', () => {
  it('is off by default, on for the view that asks and for it alone, and off again without leaving a trace', () => {
    const [a, b] = elevations();
    assert.equal(coloured(a.id), false);
    setViewColouredSurfaces(a.id, true);
    assert.equal(coloured(a.id), true);
    assert.equal(coloured(b.id), false);
    setViewColouredSurfaces(a.id, false);
    assert.equal(coloured(a.id), false);
    assert.equal(viewOf(a.id).graphics, undefined);
  });

  it('is carried by a template: saved with it, followed by a view that applies it, and a view\'s own word beats it', () => {
    const [a, b] = elevations();
    setViewColouredSurfaces(a.id, true);
    const id = saveViewAsTemplate(a.id, 'Coloured elevations')!;
    assert.equal(state().viewTemplates!.find((t) => t.id === id)!.graphics.colouredSurfaces, true);
    assert.equal(viewOf(a.id).graphics, undefined, 'it moved into the template');
    assert.equal(coloured(a.id), true);
    applyViewTemplate([b.id], id);
    assert.equal(coloured(b.id), true);
    // Asking for what the template says is no override; the opposite is one, and reset drops it.
    setViewColouredSurfaces(b.id, true);
    assert.equal(overrideCount(viewOf(b.id), state().viewTemplates!), 0);
    setViewColouredSurfaces(b.id, false);
    assert.equal(coloured(b.id), false);
    assert.equal(overrideCount(viewOf(b.id), state().viewTemplates!), 1);
    resetViewOverrides(b.id);
    assert.equal(coloured(b.id), true);
  });

  it('is saved in the project and comes back, and an undo takes it back', () => {
    const [a] = elevations();
    setViewColouredSurfaces(a.id, true);
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    assert.equal(reopened.views.find((v) => v.id === a.id)!.graphics?.colouredSurfaces, true);
    undoDrafts();
    assert.equal(coloured(a.id), false);
  });
});
