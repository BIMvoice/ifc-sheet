/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A section and its symbol on the plan stay in line both ways: moving,
 * turning or stretching the symbol moves the cut plane; changing the plane on
 * the section view moves the symbol. Undo brings both back together.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, updateProjectView, useProjectStore } from '@/project/project-store';
import type { ProjectView, SectionProjectView } from '@/project/types';
import { clearDraftHistory, editDrafts, undoDrafts } from './draft-store.js';
import { attachDraftingView, cancelCommand, clickDrawing, setWorkPlaneProvider, startDraftCommand, useDraftingSession } from './session.js';
import { grippable, installSectionLink, placementOf, symbolParts } from './section-link.js';
import { createProposedSection } from './section-create.js';

const TOL = 0.05;
const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≉ ${b}`);

let uninstall: () => void = () => {};

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ views: [planView] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
  uninstall = installSectionLink();
});

afterEach(() => uninstall());

/** A section along the drawing X axis at `y`, looking toward +Y. */
function drawSection(y = 0): SectionProjectView {
  startDraftCommand('sectionline');
  clickDrawing({ x: 0, y }, TOL, false);
  clickDrawing({ x: 10, y }, TOL, false);
  clickDrawing({ x: 5, y: y + 3 }, TOL, false);
  return section();
}
const section = (): SectionProjectView => {
  const s = useProjectStore.getState().views.find((v): v is SectionProjectView => v.kind === 'section');
  assert.ok(s, 'a section exists');
  return s;
};
const parts = () => symbolParts(useProjectStore.getState().drafts, section().id);
const custom = () => {
  const c = section().plane.custom;
  assert.ok(c);
  return c;
};

describe('the symbol moves the section', () => {
  it('a move across the line slides the cut plane by the same distance, keeping the drawing origin', () => {
    drawSection();
    const before = custom();
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    startDraftCommand('move');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 0, y: 2 }, TOL, false);
    const after = custom();
    assert.deepEqual(after.normal, before.normal, 'same direction');
    near(Math.abs(after.distance - before.distance), 2, 'moved two metres along its normal');
    near(section().plane.offset, after.distance, 'the stored offset follows');
    assert.deepEqual(after.pickedAt, before.pickedAt, 'the section drawing keeps its origin');
  });

  it('a rotation turns the cut plane', () => {
    drawSection();
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    startDraftCommand('rotate');
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    clickDrawing({ x: 5, y: 5 }, TOL, false);
    const n = custom().normal;
    // A quarter turn swaps the horizontal normal from the Z axis to the X axis.
    near(Math.abs(n[0]), 1, 'normal now along X');
    near(n[2], 0);
  });

  it('dragging one end of the cut line turns the cut, and the stems and names are redrawn at the new ends', () => {
    drawSection();
    const [cut] = parts();
    assert.ok(cut.shape.type === 'line');
    editDrafts({ update: new Map([[cut.id, { ...cut.shape, b: { x: 10, y: 10 } }]]) });
    const placement = placementOf(parts());
    assert.ok(placement);
    near(placement.b.y, 10);
    const stemB = parts()[2].shape;
    assert.ok(stemB.type === 'line');
    near(stemB.a.x, 10, 'the second stem starts at the dragged end');
    near(stemB.a.y, 10);
    const n = custom().normal;
    assert.ok(Math.abs(n[0]) > 0.1 && Math.abs(n[2]) > 0.1, 'the cut is now diagonal');
  });

  it('undo puts the section back with its symbol', () => {
    drawSection();
    const before = custom();
    clickDrawing({ x: 5, y: 0 }, TOL, false);
    startDraftCommand('move');
    clickDrawing({ x: 0, y: 0 }, TOL, false);
    clickDrawing({ x: 0, y: 2 }, TOL, false);
    undoDrafts();
    near(custom().distance, before.distance);
  });
});

describe('the section moves the symbol', () => {
  it('a new plane distance moves the cut line onto it and keeps the side looked at', () => {
    drawSection();
    const before = custom();
    const lookingBefore = placementOf(parts());
    assert.ok(lookingBefore);
    updateProjectView(section().id, { plane: { ...section().plane, custom: { ...before, distance: before.distance + 3 } } });
    const placement = placementOf(parts());
    assert.ok(placement);
    near(Math.abs(placement.a.y), 3, 'the cut line moved three metres');
    near(placement.a.y, placement.b.y, 'still straight across');
    near(Math.sign(lookingBefore.side.y - lookingBefore.a.y), Math.sign(placement.side.y - placement.a.y), 'looking the same way');
    near(custom().distance, before.distance + 3, 'and the plane is not pulled back');
  });
});

describe('other changes leave the symbol alone', () => {
  it('a graphics change on the plan does not redraw it', () => {
    drawSection();
    const before = useProjectStore.getState().drafts;
    updateProjectView('plan-1', { graphics: { joinCuts: false } });
    assert.equal(useProjectStore.getState().drafts, before);
  });
});

describe('a symbol nobody touched', () => {
  it('is not redrawn by another view\'s change, even when it no longer matches a fresh drawing of it', () => {
    drawSection();
    // A label a little off where a fresh symbol would put it (text measured differently when it was drawn).
    const label = parts().find((d) => d.shape.type === 'text');
    assert.ok(label && label.shape.type === 'text');
    uninstall();
    useProjectStore.setState({ drafts: useProjectStore.getState().drafts.map((d) => (d.id === label.id && d.shape.type === 'text' ? { ...d, shape: { ...d.shape, p: { x: d.shape.p.x, y: d.shape.p.y + 0.25 } } } : d)) });
    uninstall = installSectionLink();
    const before = useProjectStore.getState().drafts;
    updateProjectView('plan-1', { graphics: { joinCuts: false } });
    assert.equal(useProjectStore.getState().drafts, before);
  });
});

describe('a proposed section', () => {
  it('keeps its symbol through a graphics change on its plan', () => {
    const plan = { ...planView, kind: 'plan' as const };
    useProjectStore.setState({ views: [plan], levels: [plan.level] });
    createProposedSection(plan, [plan.level], { key: 'k', label: 'Through the stair', through: 'stair', a: { x: 0, z: -1 }, b: { x: 0, z: 8 }, side: { x: 1, z: 3 } });
    const before = useProjectStore.getState().drafts;
    assert.ok(before.length > 0);
    updateProjectView('plan-1', { graphics: { joinCuts: false } });
    const after = useProjectStore.getState().drafts;
    assert.deepEqual(after.map((d) => d.shape), before.map((d) => d.shape));
  });
});

describe('grips of a section symbol', () => {
  it('are the cut line\'s only', () => {
    drawSection();
    const all = useProjectStore.getState().drafts;
    const offered = grippable(all, all, useProjectStore.getState().views);
    assert.deepEqual(offered.map((e) => e.id), [parts()[0].id]);
  });
});
