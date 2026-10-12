/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The section symbol: drawing a section line on a plan leaves its symbol on
 * that plan (the line, a view arrow at each end, the section's name), tied to
 * the section view it created, and one undo step removes it again.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { clearDraftHistory, undoDrafts } from './draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, setWorkPlaneProvider, startDraftCommand, useDraftingSession } from './session.js';
import { sectionSymbolShapes } from './section-symbol.js';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const TOL = 0.05;
const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
});

describe('SECTION on a plan', () => {
  it('leaves the section symbol on the plan, linked to the new section view', () => {
    startDraftCommand('sectionline');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 10, y: 0 }, TOL, false);
    clickDrawing({ x: 5, y: 3 }, TOL, false);

    const { views, drafts } = useProjectStore.getState();
    const section = views.find((v) => v.kind === 'section');
    assert.ok(section, 'a section view is created');
    assert.ok(drafts.length > 0, 'the symbol stays drawn on the plan');
    assert.ok(drafts.every((d) => d.viewId === 'plan-1' && d.params.sectionOf === section?.id));
    assert.ok(drafts.some((d) => d.shape.type === 'line' && d.shape.a.x === 0 && d.shape.b.x === 10), 'the cut line itself is kept');
    assert.ok(drafts.some((d) => d.shape.type === 'text' && d.shape.text === section?.name), 'the section is named at the line');
  });

  it('removes the symbol with one undo, so no orphan marker is left', () => {
    startDraftCommand('sectionline');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 10, y: 0 }, TOL, false);
    clickDrawing({ x: 5, y: 3 }, TOL, false);
    assert.ok(undoDrafts());
    assert.equal(useProjectStore.getState().drafts.length, 0);
  });
});

describe('sectionSymbolShapes', () => {
  it('points the view arrows at the picked side', () => {
    const shapes = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 }, 'S1', 0.25);
    const stems = shapes.filter((s) => s.type === 'line' && s.a.x === s.b.x);
    assert.equal(stems.length, 2, 'one stem per end, perpendicular to the line');
    for (const s of stems) {
      if (s.type !== 'line') continue;
      assert.ok(s.b.y > s.a.y, 'toward +y, the picked side');
      near(s.a.y, 0);
    }
    const flipped = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -3 }, 'S1', 0.25);
    assert.ok(flipped.some((s) => s.type === 'line' && s.a.x === s.b.x && s.b.y < s.a.y));
  });
});
