/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The starting drawing set: views on sheets by kind (A-1xx plans, A-2xx
 * elevations, A-3xx sections), each sheet at the most detailed scale its
 * drawings fit at on the smallest paper that gives the group 1:100, the title
 * block filled from the model; and the Wall's
 * actions over it (lay out once, rescale a group, swap a slot).
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from './project-store.js';
import { defaultViews } from './view-defaults.js';
import { buildDrawingSet, choosePaper, drawingArea, fittingScale, groupsThatDoNotFit, sheetGroup, sheetScaleReason, withViewHung, type ModelExtent } from './drawing-set.js';
import { addScheduleToSet, groupScale, setGroupScale, startDrawingSet, swapViewportView } from './drawing-set-actions.js';
import { PAPER_MM } from './sheets.js';
import type { ProjectLevel, ProjectView } from './types';

/** A 10 × 7 m two-storey house, 6 m tall: long along X. */
const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [
  { name: 'First Floor', elevation: 3, storeyGlobalIds: ['L1'] },
  { name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] },
];

describe('buildDrawingSet', () => {
  const views = defaultViews(LEVELS);
  const sheets = buildDrawingSet({ views, extent: HOUSE, titleBlock: { project: 'Sample House', date: '2026-10-13' } });

  it('puts plans, then elevations in pairs, on numbered sheets', () => {
    assert.deepEqual(sheets.map((s) => [s.number, s.name]), [
      ['A-101', 'Floor plans'],
      ['A-201', 'Elevations, south and north'],
      ['A-202', 'Elevations, east and west'],
    ]);
    assert.deepEqual(sheets.map((s) => sheetGroup(s)), ['plans', 'elevations', 'elevations']);
  });

  it('reads the plans from the ground floor up', () => {
    const plans = sheets[0].viewports?.map((vp) => views.find((v) => v.id === vp.viewId)?.name);
    assert.deepEqual(plans, ['Ground Floor', 'First Floor']);
  });

  it('draws a small house on A3, each sheet at the most detailed scale it fits, and keeps every drawing inside the drawing area', () => {
    assert.deepEqual(sheets.map((s) => [s.number, s.paper, s.viewports?.map((v) => v.scale)]), [
      ['A-101', 'A3', [100, 100]], ['A-201', 'A3', [100, 100]], ['A-202', 'A3', [50, 50]],
    ]);
    for (const sheet of sheets) {
      const area = drawingArea(sheet.paper);
      for (const vp of sheet.viewports ?? []) {
        assert.ok(vp.x > area.x && vp.x < area.x + area.w, `${sheet.number} viewport inside the frame`);
      }
    }
  });

  it('makes a group on the smallest paper its widest row reaches 1:100 on, and a more detailed scale where the paper allows', () => {
    // 4 x 3 m: two side by side reach 1:50 on A3.
    assert.deepEqual(choosePaper([[{ w: 4, h: 3 }, { w: 4, h: 3 }]]), { paper: 'A3', fits: true });
    const small = buildDrawingSet({ views, extent: { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 3 } }, titleBlock: {} });
    assert.deepEqual(small[0].viewports?.map((v) => v.scale), [50, 50]);
    // 30 x 12 m: two plans side by side need A1 at 1:100; the rest of the set is chosen apart.
    assert.equal(choosePaper([[{ w: 30, h: 12 }, { w: 30, h: 12 }]]).paper, 'A1');
    assert.equal(choosePaper([[{ w: 12, h: 10 }, { w: 12, h: 10 }]]).paper, 'A3');
  });

  it('takes the largest paper and says when the drawings are still larger than it', () => {
    assert.deepEqual(choosePaper([[{ w: 2500, h: 2000 }]]), { paper: 'A0', fits: false });
    const huge: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 2500, y: 20, z: 2000 } };
    assert.deepEqual(groupsThatDoNotFit(views, huge), ['plans', 'elevations', 'sections'].filter((g) => g !== 'sections' || views.some((v) => v.kind === 'section')));
    assert.deepEqual(groupsThatDoNotFit(views, HOUSE), []);
  });

  it('is deterministic: the same views and extent give the same sheets', () => {
    const strip = (set: ReturnType<typeof buildDrawingSet>) => set.map((s) => ({ ...s, id: '', viewports: s.viewports?.map((v) => ({ ...v, id: '' })) }));
    assert.deepEqual(strip(buildDrawingSet({ views, extent: HOUSE, titleBlock: {}, now: 1 })), strip(buildDrawingSet({ views, extent: HOUSE, titleBlock: {}, now: 1 })));
  });

  it('fills the title block from the model on every sheet', () => {
    assert.ok(sheets.every((s) => s.titleBlock?.project === 'Sample House' && s.titleBlock.date === '2026-10-13'));
  });

  it('makes no sheet for a group with nothing in it, and pairs sections on A-301', () => {
    const sections: ProjectView[] = ['A', 'B', 'C'].map((m, i) => ({ id: `s${i}`, kind: 'section', name: `Section ${m}-${m}`, createdAt: 0, plane: { axis: 'front', offset: 0, flipped: false } }));
    const set = buildDrawingSet({ views: sections, extent: HOUSE, titleBlock: {} });
    assert.deepEqual(set.map((s) => [s.number, s.viewports?.length]), [['A-301', 2], ['A-302', 1]]);
  });
});

describe('fittingScale', () => {
  const area = drawingArea();
  it('steps down to 1:100 and 1:200 as the building grows', () => {
    assert.equal(fittingScale([{ w: 10, h: 7 }, { w: 10, h: 7 }], area), 50);
    assert.equal(fittingScale([{ w: 22, h: 15 }, { w: 22, h: 15 }], area), 100);
    assert.equal(fittingScale([{ w: 50, h: 30 }, { w: 50, h: 30 }], area), 200);
    assert.ok(area.w < PAPER_MM.A2.w);
  });
});

describe('the Wall actions', () => {
  beforeEach(() => {
    resetProject();
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  });

  it('lays out the set once, with a proposed section, and never over an existing set', () => {
    assert.equal(startDrawingSet(null, HOUSE), true);
    const { sheets, views } = useProjectStore.getState();
    assert.ok(views.some((v) => v.kind === 'section' && v.through === 'Through the middle'), 'a model with no rooms still gets a section');
    assert.deepEqual(sheets.map((s) => s.number), ['A-101', 'A-201', 'A-202', 'A-301']);
    assert.ok(useProjectStore.getState().drafts.some((d) => d.params.sectionOf), 'the section\'s symbol is on the ground floor plan');
    assert.equal(startDrawingSet(null, HOUSE), false);
    assert.equal(useProjectStore.getState().sheets, sheets, 'untouched the second time');
  });

  it('changes the scale of one group only', () => {
    startDrawingSet(null, HOUSE);
    setGroupScale('plans', 50, HOUSE);
    assert.equal(groupScale('plans'), 50);
    assert.deepEqual(useProjectStore.getState().sheets.filter((x) => x.number.startsWith('A-2')).map((x) => x.viewports?.map((v) => v.scale)), [[100, 100], [50, 50]], 'the elevations stay as the set made them');
  });

  it('swaps the view in a slot, keeping the slot', () => {
    startDrawingSet(null, HOUSE);
    const sheet = useProjectStore.getState().sheets[1];
    const slot = sheet.viewports?.[0];
    assert.ok(slot);
    const other = useProjectStore.getState().views.find((v) => v.kind === '3d');
    assert.ok(other);
    swapViewportView(sheet.id, slot.id, other.id);
    const after = useProjectStore.getState().sheets[1].viewports?.[0];
    assert.equal(after?.viewId, other.id);
    assert.equal(after?.x, slot.x);
  });
});

describe('withViewHung (a drawing added from inside a sheet)', () => {
  const section = (id: string): ProjectView => ({ id, kind: 'section', name: id, createdAt: 0, plane: { axis: 'front', offset: 0, flipped: false } });

  it('goes beside the other one on a sheet with room', () => {
    const views = [section('a'), section('b')];
    const [sheet] = buildDrawingSet({ views: [views[0]], extent: HOUSE, titleBlock: {} });
    const hung = withViewHung([sheet], views, views[1], HOUSE, {});
    assert.ok(hung);
    assert.equal(hung.sheetId, sheet.id);
    assert.deepEqual(hung.sheets[0].viewports?.map((v) => v.viewId), ['a', 'b']);
  });

  it('starts the next sheet of its series when the last one is full (#20 step 10: A-302)', () => {
    const views = [section('a'), section('b'), section('c')];
    const set = buildDrawingSet({ views: views.slice(0, 2), extent: HOUSE, titleBlock: { project: 'P' } });
    const hung = withViewHung(set, views, views[2], HOUSE, { project: 'P' });
    assert.ok(hung);
    assert.deepEqual(hung.sheets.map((s) => s.number), ['A-301', 'A-302']);
    assert.equal(hung.sheets[1].titleBlock?.project, 'P');
  });

  it('does not hang a view twice, nor a 3D view', () => {
    const views = [section('a')];
    const set = buildDrawingSet({ views, extent: HOUSE, titleBlock: {} });
    assert.equal(withViewHung(set, views, views[0], HOUSE, {}), null);
    assert.equal(withViewHung(set, views, { id: '3', kind: '3d', name: '3D', createdAt: 0, viewpoint: null }, HOUSE, {}), null);
  });
});

describe('schedules on the set', () => {
  beforeEach(() => {
    resetProject();
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
    startDrawingSet(null, HOUSE);
  });

  it('hang one to a sheet in the A-6xx series, with the set\'s title block', () => {
    const doors = addScheduleToSet('all', 'Door and window schedule');
    const takeoff = addScheduleToSet('materials', 'Material takeoff');
    const { sheets, schedules } = useProjectStore.getState();
    const placed = [doors, takeoff].map((id) => sheets.find((s) => s.id === id));
    assert.deepEqual(placed.map((s) => s?.number), ['A-601', 'A-602']);
    assert.deepEqual(placed.map((s) => sheetGroup(s ?? { number: '' })), ['schedules', 'schedules']);
    assert.deepEqual(placed.map((s) => schedules?.find((x) => x.id === s?.viewports?.[0]?.viewId)?.kind), ['all', 'materials']);
    assert.equal(placed[0]?.titleBlock?.date, sheets[0].titleBlock?.date);
  });

  it('give no scale reason for a schedule sheet', () => {
    const id = addScheduleToSet('materials', 'Material takeoff');
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === id);
    assert.ok(sheet);
    assert.equal(sheetScaleReason(sheet, useProjectStore.getState().views, HOUSE), null);
  });
});
