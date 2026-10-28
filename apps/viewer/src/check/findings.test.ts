/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What is missing from a drawing set: each check on its own, then the order of the whole. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorOf, encodeAnchor } from '@/drafting/dimension-anchor';
import { newDraft } from '@/drafting/draft-store';
import type { DraftEntity } from '@/drafting/types';
import type { ProjectSheet } from '@/project/types';
import {
  checkSet, danglingAnnotations, detailsOnNoSheet, duplicateNumbers, emptySheets, emptyTitleBlocks, plansWithoutDimensions,
  sectionsMarkedOnNoSheetPlan, untaggedElements, viewsOnNoSheet, viewsWithoutLevelMarks,
} from './findings.js';
import type { CheckInput, PlanElement } from './types.js';

const vp = (viewId: string) => ({ id: `vp-${viewId}`, viewId, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null });
const sheet = (id: string, number: string, views: string[], over: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name: `Sheet ${number}`, createdAt: 0, viewports: views.map(vp), ...over });
const text = (viewId: string, params: Record<string, string | number | boolean> = {}): DraftEntity => newDraft(viewId, 'l', { type: 'text', p: { x: 0, y: 0 }, text: 't', height: 0.25, rotation: 0 }, params);
const dim = (viewId: string) => newDraft(viewId, 'l', { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, at: { x: 0, y: 1 }, height: 0.25 });
const level = (viewId: string) => newDraft(viewId, 'l', { type: 'level', p: { x: 0, y: 0 }, value: 0, height: 0.25 });

const plan = { id: 'plan', name: 'Erdgeschoss', kind: 'plan' };
const sec = { id: 'sec', name: 'Section A-A', kind: 'section' };
const elev = { id: 'elev', name: 'North Elevation', kind: 'elevation' };
const detail = { id: 'det', name: 'Detail 1', kind: 'plan', detail: { n: 1 } };
const els: PlanElement[] = [{ guid: 'D1', className: 'IfcDoor' }, { guid: 'D2', className: 'IfcDoor' }, { guid: 'W1', className: 'IfcWindow' }, { guid: 'R1', className: 'IfcSpace' }, { guid: 'S1', className: 'IfcWall' }];
const base = (over: Partial<CheckInput> = {}): CheckInput => ({
  views: [plan, sec, elev], projectName: 'House', titleBlock: { project: 'P', drawnBy: 'X', date: '2026-10-13' }, sheets: [sheet('s1', 'A-101', ['plan']), sheet('s2', 'A-301', ['sec', 'elev'])], drafts: [],
  planElements: (id) => (id === 'plan' ? els : []), elementExists: () => true, ...over,
});

describe('untaggedElements', () => {
  it('counts the doors, windows and rooms of a plan on a sheet that have no tag or label', () => {
    const f = untaggedElements(base());
    assert.deepEqual(f.map((x) => [x.kind, x.params.what, x.params.count, x.sheetId, x.viewId, x.fix]), [['untaggedOpenings', 'door', 2, 's1', 'plan', 'TAGALL'], ['untaggedOpenings', 'window', 1, 's1', 'plan', 'TAGALL'], ['unlabelledRooms', 'room', 1, 's1', 'plan', 'TAGALL']]);
    assert.deepEqual(f[0].guids, ['D1', 'D2']);
  });
  it('is satisfied by a label or a tag of the element in that view only', () => {
    const f = untaggedElements(base({ drafts: [text('plan', { labelOf: 'D1' }), text('plan', { tagOf: 'D2' }), text('other', { labelOf: 'W1' })] }));
    assert.deepEqual(f.map((x) => [x.params.what, x.guids]), [['window', ['W1']], ['room', ['R1']]]);
  });
  it('leaves a plan that is on no sheet, and a detail, alone', () => {
    assert.deepEqual(untaggedElements(base({ sheets: [sheet('s1', 'A-101', [])] })), []);
    assert.deepEqual(untaggedElements(base({ views: [detail], sheets: [sheet('s1', 'A-101', ['det'])], planElements: () => els })), []);
  });
  it('says a plan on a sheet has not been drawn, rather than calling it complete', () => {
    assert.deepEqual(untaggedElements(base({ planElements: () => null })).map((x) => x.kind), ['planNotDrawn']);
  });
});

describe('plansWithoutDimensions', () => {
  it('finds a plan on a sheet with none, with the command that fixes it', () => {
    assert.deepEqual(plansWithoutDimensions(base()).map((x) => [x.viewId, x.fix]), [['plan', 'DIMALL']]);
    assert.deepEqual(plansWithoutDimensions(base({ drafts: [dim('plan')] })), []);
    assert.deepEqual(plansWithoutDimensions(base({ sheets: [] })), []);
  });
});

describe('viewsWithoutLevelMarks', () => {
  it('finds a section and an elevation on a sheet with no level mark', () => {
    assert.deepEqual(viewsWithoutLevelMarks(base()).map((x) => [x.viewId, x.fix]), [['sec', 'LEVELALL'], ['elev', 'LEVELALL']]);
    assert.deepEqual(viewsWithoutLevelMarks(base({ drafts: [level('sec')] })).map((x) => x.viewId), ['elev']);
  });
});

describe('viewsOnNoSheet and emptySheets', () => {
  it('finds a view that is on no sheet, but not a 3D view or a detail', () => {
    const f = viewsOnNoSheet(base({ views: [plan, sec, elev, { id: 'v3', name: '3D', kind: '3d' }, detail], sheets: [sheet('s1', 'A-101', ['plan'])] }));
    assert.deepEqual(f.map((x) => x.viewId), ['sec', 'elev']);
  });
  it('finds a sheet with nothing on it', () => {
    assert.deepEqual(emptySheets(base({ sheets: [sheet('s1', 'A-101', ['plan']), sheet('s9', 'A-900', [])] })).map((x) => x.sheetId), ['s9']);
    assert.deepEqual(emptySheets(base({ sheets: [{ ...sheet('s9', 'A-900', []), viewports: undefined }] })).map((x) => x.sheetId), ['s9']);
  });
});

describe('emptyTitleBlocks', () => {
  it('names each empty field: project, title, drawn by, date', () => {
    const f = emptyTitleBlocks(base({ projectName: '', sheets: [sheet('s1', 'A-101', ['plan'], { name: ' ', titleBlock: { project: '', drawnBy: '  ', date: '' } })] }));
    assert.deepEqual(f.map((x) => x.params.field), ['project', 'title', 'drawnBy', 'date']);
    assert.deepEqual(emptyTitleBlocks(base()), []);
  });
  it('reads the project title block: a field it fills is not missing on a sheet that says nothing of its own', () => {
    assert.deepEqual(emptyTitleBlocks(base({ titleBlock: { drawnBy: 'PC', date: '2026-10-13' }, sheets: [sheet('s1', 'A-101', ['plan'])] })), []);
    const f = emptyTitleBlocks(base({ titleBlock: { date: '2026-10-13' }, sheets: [sheet('s1', 'A-101', ['plan'])] }));
    assert.deepEqual(f.map((x) => x.params.field), ['drawnBy']);
  });
  it('takes the project name for the project field when the title block has none', () => {
    assert.deepEqual(emptyTitleBlocks(base({ titleBlock: { drawnBy: 'PC', date: 'd' }, projectName: 'House', sheets: [sheet('s1', 'A-101', ['plan'])] })), []);
    assert.deepEqual(emptyTitleBlocks(base({ titleBlock: { drawnBy: 'PC', date: 'd' }, projectName: '', sheets: [sheet('s1', 'A-101', ['plan'])] })).map((x) => x.params.field), ['project']);
  });
  it('lets a sheet say otherwise: its empty field wins over the project value', () => {
    const f = emptyTitleBlocks(base({ sheets: [sheet('s1', 'A-101', ['plan'], { titleBlock: { drawnBy: '' } })] }));
    assert.deepEqual(f.map((x) => x.params.field), ['drawnBy']);
  });
});

describe('duplicateNumbers', () => {
  it('finds sheets that share a number, ignoring case and spaces, once per number', () => {
    const f = duplicateNumbers(base({ sheets: [sheet('a', 'A-101', []), sheet('b', 'a-101 ', []), sheet('c', 'A-102', []), sheet('d', 'A-101', [])] }));
    assert.deepEqual(f.map((x) => [x.sheetId, x.params.count]), [['a', 3]]);
  });
});

describe('sectionsMarkedOnNoSheetPlan and detailsOnNoSheet', () => {
  const mark = (viewId: string) => text(viewId, { sectionOf: 'sec' });
  it('finds a section whose mark is on no plan, or only on a plan that is on no sheet', () => {
    assert.deepEqual(sectionsMarkedOnNoSheetPlan(base()).map((x) => x.viewId), ['sec']);
    assert.deepEqual(sectionsMarkedOnNoSheetPlan(base({ drafts: [mark('plan')] })), []);
    assert.deepEqual(sectionsMarkedOnNoSheetPlan(base({ drafts: [mark('plan')], sheets: [sheet('s2', 'A-301', ['sec'])] })).map((x) => x.viewId), ['sec']);
  });
  it('finds a detail on no sheet', () => {
    assert.deepEqual(detailsOnNoSheet(base({ views: [plan, detail] })).map((x) => x.viewId), ['det']);
    assert.deepEqual(detailsOnNoSheet(base({ views: [plan, detail], sheets: [sheet('s1', 'A-101', ['plan', 'det'])] })), []);
  });
});

describe('danglingAnnotations', () => {
  it('finds a tag or label whose element is gone, with the element and the annotation', () => {
    const d = [text('plan', { labelOf: 'GONE' }), text('plan', { tagOf: 'HERE' }), text('plan')];
    const f = danglingAnnotations(base({ drafts: d, elementExists: (g) => g === 'HERE' }));
    assert.deepEqual(f.map((x) => [x.draftId, x.guids, x.viewId, x.sheetId]), [[d[0].id, ['GONE'], 'plan', 's1']]);
  });
});

describe('checkSet', () => {
  it('lists a finished set as empty', () => {
    const done = base({ drafts: [text('plan', { labelOf: 'D1' }), text('plan', { labelOf: 'D2' }), text('plan', { labelOf: 'W1' }), text('plan', { labelOf: 'R1' }), dim('plan'), level('sec'), level('elev'), text('plan', { sectionOf: 'sec' })] });
    assert.deepEqual(checkSet(done), []);
  });
  it('lists sheet by sheet in the order of the set, then what is on no sheet', () => {
    const f = checkSet(base({ views: [plan, sec, elev, { id: 'x', name: 'Loose', kind: 'plan' }] }));
    const ids = f.map((x) => x.sheetId);
    assert.deepEqual(ids, [...ids].sort((a, b) => (a ?? '~').localeCompare(b ?? '~')));
    assert.ok(f.some((x) => x.kind === 'viewOffSheet' && x.viewId === 'x'));
  });
  it('is the same every time', () => assert.deepEqual(checkSet(base()), checkSet(base())));
});

describe('danglingAnnotations, named', () => {
  const tag = (viewId: string, label: string, guid: string) => newDraft(viewId, 'l', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], text: label, height: 0.25 }, { tagOf: guid });
  const known = (g: string) => ({ H: { name: 'Haustuer', className: 'Door' } } as Record<string, { name: string; className: string }>)[g];
  it('gives each of two orphaned tags its own finding, naming the tag, the element and the sheet', () => {
    const d = [tag('plan', 'Haustuer', 'H'), tag('plan', 'EG-Fenster-1', 'W')];
    const f = danglingAnnotations(base({ drafts: d, elementExists: () => false, lastKnown: known }));
    assert.equal(f.length, 2);
    assert.deepEqual(f.map((x) => [x.draftId, x.params.text, x.params.sheet, x.params.view]), [[d[0].id, 'Haustuer', 'A-101', 'Erdgeschoss'], [d[1].id, 'EG-Fenster-1', 'A-101', 'Erdgeschoss']]);
    assert.equal(f[0].params.element, 'Door · "Haustuer" · H');
    assert.equal(f[1].params.element, 'W', 'no last known state: the GlobalId alone');
    assert.deepEqual(f[0].remedies, ['delete', 'reattach']);
    assert.ok(f[0].box && f[0].box.max.x > f[0].box.min.x, 'it knows where the tag is, to zoom to it');
  });
  it('falls back to the last known name, then the GlobalId, for an annotation with no text', () => {
    const blank = newDraft('plan', 'l', { type: 'text', p: { x: 0, y: 0 }, text: ' ', height: 0.25, rotation: 0 }, { labelOf: 'H' });
    assert.equal(danglingAnnotations(base({ drafts: [blank], elementExists: () => false, lastKnown: known }))[0].params.text, 'Haustuer');
    assert.equal(danglingAnnotations(base({ drafts: [blank], elementExists: () => false }))[0].params.text, 'H');
  });
  it('lists a tag whose view is on two sheets once, with both sheets', () => {
    const f = danglingAnnotations(base({ drafts: [tag('plan', 'Haustuer', 'H')], elementExists: () => false, sheets: [sheet('s1', 'A-101', ['plan']), sheet('s2', 'A-102', ['plan'])] }));
    assert.equal(f.length, 1);
    assert.equal(f[0].params.sheet, 'A-101, A-102');
  });
  it('lists a dimension snapped to a wall that is gone, and not one whose walls are all there or one drawn in the open (#459)', () => {
    const rect = { x0: 0, y0: 0, x1: 4, y1: 0.2 };
    const shape = { type: 'dimension' as const, variant: 'aligned' as const, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: -1 }, height: 0.25 };
    const end = (guid: string, x: number) => encodeAnchor(anchorOf({ x, y: 0 }, { guid, rect })!);
    const toGone = newDraft('plan', 'l', shape, { anchorA: end('HERE', 0), anchorB: end('GONE', 4) });
    const toBoth = newDraft('plan', 'l', shape, { anchorA: end('HERE', 0), anchorB: end('HERE', 4) });
    const free = newDraft('plan', 'l', shape);
    const f = danglingAnnotations(base({ drafts: [toGone, toBoth, free], elementExists: (g) => g === 'HERE', lastKnown: (g) => (g === 'GONE' ? { className: 'IfcWall', name: 'W2' } : undefined) }));
    assert.deepEqual(f.map((x) => [x.draftId, x.guids, x.params.what, x.remedies]), [[toGone.id, ['GONE'], 'dimension', ['delete']]]);
    assert.equal(f[0].params.element, 'IfcWall · "W2" · GONE');
  });
  it('offers a dimension only the delete remedy, and a tag with no sheet says so', () => {
    const m = newDraft('plan', 'l', { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, at: { x: 0, y: 1 }, height: 0.25 }, { measures: 'H' });
    const f = danglingAnnotations(base({ drafts: [m], elementExists: () => false, sheets: [] }));
    assert.deepEqual([f[0].remedies, f[0].params.sheet, f[0].sheetId], [['delete'], '', undefined]);
  });
});
