/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Making the drawing set whole: the one planner behind the Wall's starting set
 * and the DRAFTSET command. It adds only what is missing, puts the elevation
 * planes at the building's facades, gives views a depth, and is one undo step.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { createProposedSection } from '@/drafting/section-create';
import { addProjectSheet, projectDocument, removeProjectItem, resetProject, syncProjectWithModels, updateProjectView, useProjectStore } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { ensureDrawingSet } from './drawing-set-actions.js';
import type { SectionProposal } from './section-proposals.js';

/** A 12 x 10 m building, 6 m tall, far from the origin: x 100..112, z 200..210. */
const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const STOREYS = [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }];

const state = () => useProjectStore.getState();
const run = () => ensureDrawingSet(null, bounds);
const sections = () => state().views.filter((v) => v.kind === 'section');
const hall: SectionProposal = { key: 'room-Hall', label: 'Through Hall', through: 'Hall', a: { x: 103, z: 201 }, b: { x: 103, z: 209 }, side: { x: 104, z: 205 } };

function makeHallSection(): string {
  const ground = state().views.find((v) => v.kind === 'plan' && v.level.elevation === 0);
  if (ground?.kind !== 'plan') throw new Error('ground plan');
  const id = createProposedSection(ground, state().levels, hall);
  if (!id) throw new Error('section');
  return id;
}

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  // What the app does when a model loads: plans per level, four elevations, a 3D view.
  syncProjectWithModels([{ key: 'm', name: 'm' }], STOREYS);
});

describe('ensureDrawingSet', () => {
  it('stands the elevation planes at the building, and keeps one the person placed', () => {
    const south = state().views.find((v) => v.kind === 'elevation' && v.direction === 'south');
    assert.ok(south);
    updateProjectView(south.id, { planeOffset: 150 });
    run();
    const offset = (d: string) => (state().views.find((v) => v.kind === 'elevation' && v.direction === d) as { planeOffset: number }).planeOffset;
    assert.ok(Math.abs(offset('north') - 200.05) < 1e-9);
    assert.ok(Math.abs(offset('east') - 111.95) < 1e-9);
    assert.equal(offset('south'), 150);
  });

  it('adds the missing section and the sheets, reusing the plans and elevations that exist', () => {
    const before = state().views.length;
    const report = run();
    assert.deepEqual({ ...report, notes: [] }, { viewsAdded: 1, viewsExisting: 6, sheetsAdded: 4, sheetsExisting: 0, addedSheetNumbers: ['A-101', 'A-201', 'A-202', 'A-301'], notes: [] });
    assert.equal(state().views.length, before + 1);
    assert.deepEqual(state().sheets.map((s) => s.number), ['A-101', 'A-201', 'A-202', 'A-301']);
    // Every drawing is on exactly one sheet, except the 3D view.
    const placed = state().sheets.flatMap((s) => (s.viewports ?? []).map((v) => v.viewId));
    assert.equal(new Set(placed).size, placed.length);
    assert.equal(placed.length, state().views.filter((v) => v.kind !== '3d').length);
  });

  it('makes each group on the smallest paper that gives it 1:100, each sheet at the most detailed scale it fits', () => {
    run();
    const papers = state().sheets.map((s) => [s.number, s.paper, s.viewports?.map((v) => v.scale)]);
    assert.deepEqual(papers, [['A-101', 'A3', [100, 100]], ['A-201', 'A3', [100, 100]], ['A-202', 'A3', [100, 100]], ['A-301', 'A3', [50]]]);
  });

  it('cuts the proposed section through the middle and draws its symbol on the ground plan', () => {
    run();
    const [s] = sections();
    if (s?.kind !== 'section') throw new Error('section');
    assert.equal(s.through, 'Through the middle');
    assert.deepEqual(s.plane.custom?.normal.map((n) => Math.abs(n)), [1, 0, 0]);
    assert.ok(Math.abs(Math.abs(s.plane.custom?.distance ?? 0) - 106) < 1e-9);
    const ground = state().views.find((v) => v.kind === 'plan' && v.level.elevation === 0);
    const marks = state().drafts.filter((d) => d.params.sectionOf === s.id);
    assert.ok(marks.length > 0 && marks.every((d) => d.viewId === ground?.id));
  });

  it('gives views a default depth, and a plan the scale of its sheet', () => {
    run();
    const depth = (name: string) => state().views.find((v) => v.name === name)?.viewDepth;
    // The section looks +x from the middle of 12 m: 6 m to the far wall + 1 m. North / south see through 10 m, east / west through 12 m, each + 1 m.
    assert.equal(sections()[0].viewDepth, 7);
    assert.equal(depth('North Elevation'), 11);
    assert.equal(depth('East Elevation'), 13);
    assert.equal(state().views.find((v) => v.kind === 'plan')?.scale, 100);
  });

  it('keeps a depth the person set, and recognises a section by what it passes through, not its name', () => {
    run();
    const [s] = sections();
    updateProjectView(s.id, { viewDepth: 2.5 });
    useProjectStore.setState((st) => ({ views: st.views.map((v) => (v.id === s.id ? { ...v, name: 'Long section' } : v)) }));
    const report = run();
    assert.equal(report.viewsAdded, 0);
    assert.equal(state().views.find((v) => v.id === s.id)?.viewDepth, 2.5);
  });

  it('is one undo step: Undo removes the whole set and Redo brings it back', () => {
    const { views, sheets, drafts } = state();
    run();
    const after = projectDocument();
    assert.equal(undoDrafts(), true);
    assert.deepEqual(state().views, views);
    assert.deepEqual(state().sheets, sheets);
    assert.deepEqual(state().drafts, drafts);
    assert.equal(undoDrafts(), false, 'nothing else on the stack');
    assert.equal(redoDrafts(), true);
    assert.deepEqual(projectDocument(), after);
  });

  it('undoing the set removes only what it added; what came after stays, and Redo puts the set back', () => {
    run();
    const mine = makeHallSection();
    const sheet = addProjectSheet('Details');
    assert.equal(undoDrafts(), true, 'the section');
    assert.equal(undoDrafts(), true, 'the set');
    assert.deepEqual(sections().map((v) => v.id), [mine], 'the set\'s section is gone, the person\'s own stays');
    assert.ok(state().sheets.some((s) => s.id === sheet), 'the sheet added later is still there');
    assert.equal(redoDrafts(), true);
    assert.equal(sections().length, 2);
    assert.ok(state().sheets.some((s) => s.id === sheet));
  });

  it('running it again adds nothing and changes nothing, and leaves no undo step', () => {
    run();
    const doc = JSON.stringify(projectDocument());
    const report = run();
    assert.deepEqual({ ...report, notes: [] }, { viewsAdded: 0, viewsExisting: 7, sheetsAdded: 0, sheetsExisting: 4, addedSheetNumbers: [], notes: [] });
    assert.equal(JSON.stringify(projectDocument()), doc);
    assert.equal(undoDrafts(), true);
    assert.equal(sections().length, 0, 'the second run left no step of its own');
  });

  it('hangs a section the person made on the sheet of its series, then adds nothing more', () => {
    run();
    const id = makeHallSection();
    const report = run();
    assert.deepEqual([report.viewsAdded, report.sheetsAdded], [0, 0], 'it joins A-301, which has room');
    assert.equal(state().sheets.find((s) => s.number === 'A-301')?.viewports?.some((v) => v.viewId === id), true);
    const doc = JSON.stringify(projectDocument());
    run();
    assert.equal(JSON.stringify(projectDocument()), doc);
  });

  it('an extra sheet takes a number that does not clash with the set', () => {
    run();
    const id = addProjectSheet('Details');
    assert.equal(state().sheets.find((s) => s.id === id)?.number, 'A-102');
  });

  it('adds back only what the person deleted, and does not duplicate the rest', () => {
    run();
    removeProjectItem(state().sheets.find((s) => s.number === 'A-301')?.id ?? '');
    removeProjectItem(sections()[0].id);
    const report = run();
    assert.deepEqual([report.viewsAdded, report.sheetsAdded], [1, 1]);
    assert.equal(sections().length, 1);
    assert.equal(state().sheets.length, 4);
  });

  it('does not give a project that already has sections proposed ones when it opens', () => {
    makeHallSection();
    const report = ensureDrawingSet(null, bounds, { onOpen: true });
    assert.equal(sections().length, 1);
    assert.equal(report.sheetsAdded, 4);
  });

  it('a model with no storeys gets one plan cut at mid-height, and says so', () => {
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], []);
    useProjectStore.setState({ views: state().views.filter((v) => v.kind !== 'plan') });
    const report = run();
    const plan = state().views.find((v) => v.kind === 'plan');
    assert.equal(plan?.kind === 'plan' && plan.cutHeight, 3);
    assert.ok(report.notes.some((n) => n.key === 'draftSet.note.noStoreys' && n.params.height === 3));
  });

  it('says so when a group is larger than the largest paper at the smallest scale', () => {
    const report = ensureDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 2500, y: 20, z: 2000 } });
    assert.ok(report.notes.some((n) => n.key === 'draftSet.note.noFit' && n.params.kind === 'plans'));
    assert.deepEqual(new Set(state().sheets.filter((s) => s.number.startsWith('A-1')).map((s) => s.paper)), new Set(['A0']));
  });

  it('everything it made survives save and open', () => {
    run();
    const doc = projectDocument();
    const back = parseProjectFile(serializeProject(doc));
    assert.deepEqual(back.sheets, doc.sheets);
    assert.deepEqual(back.views.map((v) => [v.kind, v.name, v.viewDepth ?? null, v.scale ?? null]), doc.views.map((v) => [v.kind, v.name, v.viewDepth ?? null, v.scale ?? null]));
    assert.equal(back.drafts.length, doc.drafts.length);
    // Opening it again changes nothing, and the set is still complete: running it adds nothing.
    assert.deepEqual(parseProjectFile(serializeProject(back)), back);
    useProjectStore.setState({ ...back, dirty: false });
    const report = run();
    assert.equal(report.viewsAdded + report.sheetsAdded, 0);
  });
});
