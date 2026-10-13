/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { addSectionFromLine } from '@/drafting/commands/workplane';
import { addProjectSheet, addProjectView, projectDocument, removeProjectItem, resetProject, syncProjectWithModels, updateProjectView, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { applyDraftSet } from './apply.js';
import { planDraftSet } from './plan.js';
import { appSheetSpec } from './sheet-spec.js';
import type { DraftSetPlan } from './types.js';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const STOREYS = [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }];

function makePlan(): DraftSetPlan {
  return planDraftSet({ projectName: 'Casa', buildingName: 'Corp A', date: '2026-10-13', storeys: STOREYS, bounds, spec: appSheetSpec() });
}
const apply = (plan = makePlan()) =>
  applyDraftSet(plan, { levels: useProjectStore.getState().levels, bounds, text: (r) => `${r.key}|${r.params.names ?? ''}` });
const state = () => useProjectStore.getState();
const sections = () => state().views.filter((v) => v.kind === 'section');

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  // What the app does when a model loads: plans per level, four elevations, a 3D view.
  syncProjectWithModels([{ key: 'm', name: 'm' }], STOREYS);
});

describe('applyDraftSet', () => {
  it('stands the elevation planes at the extents it was given, and keeps one the person placed', () => {
    const north = state().views.find((v) => v.kind === 'elevation' && v.direction === 'north');
    const south = state().views.find((v) => v.kind === 'elevation' && v.direction === 'south');
    assert.ok(north && south);
    updateProjectView(south.id, { planeOffset: 150 });
    apply();
    const off = (d: string) => state().views.find((v) => v.kind === 'elevation' && v.direction === d);
    assert.ok(Math.abs(((off('north') as { planeOffset: number }).planeOffset) - 200.05) < 1e-9);
    assert.equal((off('south') as { planeOffset: number }).planeOffset, 150);
  });

  it('adds the missing sections and the sheets with their viewports, reusing the plans and elevations that exist', () => {
    const before = state().views.length;
    const report = apply();
    assert.deepEqual(report, { viewsAdded: 2, viewsExisting: 6, sheetsAdded: 4, sheetsExisting: 0, addedSheetNumbers: ['A-101', 'A-201', 'A-202', 'A-301'] });
    assert.equal(state().views.length, before + 2);
    assert.deepEqual(sections().map((v) => v.name), ['Section A-A', 'Section B-B']);
    assert.deepEqual(state().sheets.map((s) => s.number), ['A-101', 'A-201', 'A-202', 'A-301']);
    const sheet = state().sheets[0];
    assert.equal(sheet.name, 'draftSet.title.plans|Ground Floor / Level 1');
    assert.deepEqual([sheet.paper, sheet.orientation], ['A3', 'landscape']);
    assert.deepEqual(sheet.titleBlock, { project: 'Casa - Corp A', date: '2026-10-13' });
    assert.deepEqual((sheet.viewports ?? []).map((v) => [v.scale, v.width, v.height, v.center]), [[100, 210, 190, null], [100, 0, 0, null]]);
    // The plan with the section marks has a box of its own; the others fit their drawing.
    // Every view is on exactly one sheet, except the 3D view.
    const placed = state().sheets.flatMap((s) => (s.viewports ?? []).map((v) => v.viewId));
    assert.equal(new Set(placed).size, placed.length);
    assert.equal(placed.length, state().views.filter((v) => v.kind !== '3d').length);
  });

  it('cuts the sections through the middle of the box and marks them on the ground plan', () => {
    apply();
    const [a, b] = sections();
    if (a.kind !== 'section' || b.kind !== 'section') throw new Error('sections');
    // A-A runs along x through z = 205: its normal is the z axis and the plane passes z = 205.
    assert.deepEqual(a.plane.custom?.normal.map((n) => Math.abs(n)), [0, 0, 1]);
    assert.ok(Math.abs(Math.abs(a.plane.custom?.distance ?? 0) - 205) < 1e-9);
    assert.deepEqual(b.plane.custom?.normal.map((n) => Math.abs(n)), [1, 0, 0]);
    assert.ok(Math.abs(Math.abs(b.plane.custom?.distance ?? 0) - 106) < 1e-9);
    const ground = state().views.find((v) => v.kind === 'plan' && v.level.elevation === 0);
    for (const v of [a, b]) {
      const marks = state().drafts.filter((d) => d.params.sectionOf === v.id);
      assert.ok(marks.length > 0);
      assert.ok(marks.every((d) => d.viewId === ground?.id));
    }
  });

  it('writes the planned depths to the views, and a plan takes the scale of its sheet', () => {
    apply();
    const depth = (name: string) => state().views.find((v) => v.name === name)?.viewDepth;
    assert.equal(depth('Section A-A'), 6);
    assert.equal(depth('Section B-B'), 7);
    assert.equal(depth('North Elevation'), 11);
    assert.equal(depth('East Elevation'), 13);
    assert.equal(state().views.find((v) => v.kind === 'plan')?.scale, 100);
  });

  it('is one undo step: Undo removes the whole set and Redo brings it back', () => {
    const views = state().views;
    const sheets = state().sheets;
    const drafts = state().drafts;
    apply();
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
    apply();
    const ground = state().views.find((v) => v.kind === 'plan' && v.level.elevation === 0);
    if (!ground) throw new Error('ground plan');
    const mine = addSectionFromLine({ axis: 'y', position: 1.2, flipped: false }, ground.id, { x: 103, y: 201 }, { x: 103, y: 209 }, { x: 104, y: 205 }, { layerId: '0', textHeight: 0.25, current: { textStyle: 'standard', dimStyle: 'standard' } });
    const sheet = addProjectSheet('Details');
    assert.equal(undoDrafts(), true, 'the section');
    assert.equal(undoDrafts(), true, 'the set');
    assert.deepEqual(sections().map((v) => v.id), [mine], 'the set\'s sections are gone, the person\'s own stays');
    assert.ok(state().sheets.some((s) => s.id === sheet), 'the sheet added later is still there');
    assert.deepEqual(state().sheets.filter((s) => s.number.startsWith('A-2') || s.number === 'A-301').map((s) => s.number), []);
    assert.equal(redoDrafts(), true);
    assert.deepEqual(sections().map((v) => v.name).sort(), ['Section A-A', 'Section B-B', 'Section C-C']);
    assert.ok(state().sheets.some((s) => s.id === sheet));
  });

  it('a view added after the set survives undoing the set', () => {
    apply();
    const id = addProjectView({ kind: 'elevation', name: 'Courtyard', direction: 'north', viewDepth: 5 });
    assert.equal(undoDrafts(), true);
    assert.ok(state().views.some((v) => v.id === id), 'the later view stays');
    assert.equal(sections().length, 0);
    assert.equal(redoDrafts(), true);
    assert.equal(sections().length, 2);
    assert.ok(state().views.some((v) => v.id === id));
  });

  it('running it again adds nothing and changes nothing', () => {
    apply();
    const doc = JSON.stringify(projectDocument());
    const report = apply();
    assert.deepEqual(report, { viewsAdded: 0, viewsExisting: 8, sheetsAdded: 0, sheetsExisting: 4, addedSheetNumbers: [] });
    assert.equal(JSON.stringify(projectDocument()), doc);
    assert.equal(undoDrafts(), true);
    assert.equal(sections().length, 0, 'the second run left no step of its own');
  });

  it('after the person adds a section with SECTION, running it again adds nothing and the next mark follows', () => {
    apply();
    const ground = state().views.find((v) => v.kind === 'plan' && v.level.elevation === 0);
    if (!ground) throw new Error('ground plan');
    const plane = { axis: 'y' as const, position: 1.2, flipped: false };
    const id = addSectionFromLine(plane, ground.id, { x: 103, y: 201 }, { x: 103, y: 209 }, { x: 104, y: 205 }, { layerId: '0', textHeight: 0.25, current: { textStyle: 'standard', dimStyle: 'standard' } });
    assert.equal(state().views.find((v) => v.id === id)?.name, 'Section C-C');
    const doc = JSON.stringify(projectDocument());
    const report = apply();
    assert.equal(report.viewsAdded + report.sheetsAdded, 0);
    assert.equal(JSON.stringify(projectDocument()), doc);
  });

  it('an extra sheet takes a number that does not clash with the set', () => {
    apply();
    const id = addProjectSheet('Details');
    const number = state().sheets.find((s) => s.id === id)?.number;
    assert.equal(number, 'A-102');
  });

  it('adds back only what the person deleted, and does not duplicate the rest', () => {
    apply();
    const sheet = state().sheets.find((s) => s.number === 'A-301');
    const view = sections()[1];
    removeProjectItem(sheet?.id ?? '');
    removeProjectItem(view.id);
    const report = apply();
    assert.deepEqual([report.viewsAdded, report.sheetsAdded], [1, 1]);
    assert.equal(sections().length, 2);
    assert.equal(state().sheets.length, 4);
    // The renewed section is B-B again: its mark was free.
    assert.deepEqual(sections().map((v) => v.name), ['Section A-A', 'Section B-B']);
  });

  it('recognises a section by its plane, not its name, and keeps a depth the person set', () => {
    apply();
    const [a] = sections();
    updateProjectView(a.id, { viewDepth: 2.5 });
    useProjectStore.setState((s) => ({ views: s.views.map((v) => (v.id === a.id ? { ...v, name: 'Long section' } : v)) }));
    const report = apply();
    assert.equal(report.viewsAdded, 0);
    assert.equal(state().views.find((v) => v.id === a.id)?.viewDepth, 2.5);
  });

  it('everything it made survives save and open', () => {
    apply();
    const doc = projectDocument();
    const back = parseProjectFile(serializeProject(doc));
    assert.deepEqual(back.sheets, doc.sheets);
    assert.deepEqual(back.views.map((v) => [v.kind, v.name, v.viewDepth ?? null, v.scale ?? null]), doc.views.map((v) => [v.kind, v.name, v.viewDepth ?? null, v.scale ?? null]));
    assert.equal(back.drafts.length, doc.drafts.length);
    // Opening it again changes nothing, and the set is still complete: running it adds nothing.
    assert.deepEqual(parseProjectFile(serializeProject(back)), back);
    useProjectStore.setState({ ...back, dirty: false });
    const report = apply();
    assert.equal(report.viewsAdded + report.sheetsAdded, 0);
  });
});
