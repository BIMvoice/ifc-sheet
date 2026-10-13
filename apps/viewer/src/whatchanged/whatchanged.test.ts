/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What changed between two states of a model, and which sheets and annotations it reaches. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDraft } from '@/drafting/draft-store';
import type { DraftEntity } from '@/drafting/types';
import type { ProjectSheet } from '@/project/types';
import { compareStates } from './compare.js';
import { annotationImpacts } from './impact.js';
import { sheetChanges } from './report.js';
import { snapshotFromElements, type ModelSnapshot, type SnapElement } from './snapshot.js';
import { changesInView, cutBand, planBand } from './visibility.js';

const el = (k: string, over: Partial<SnapElement> = {}): SnapElement => ({ k, t: 'IfcWall', n: `Wall ${k}`, d: `d-${k}`, c: { 'attr:core': `a-${k}`, 'type-assignment': 't0' }, g: `g-${k}`, a: [0, 0, 0, 4, 0.2, 3], ...over });
const state = (...elements: SnapElement[]): ModelSnapshot => snapshotFromElements(elements, 0);
const only = (a: ModelSnapshot, b: ModelSnapshot) => compareStates(a, b).map((c) => [c.guid, c.kinds.join('+'), c.sets.join(',')]);

describe('compareStates', () => {
  it('reports nothing for the same model', () => assert.deepEqual(only(state(el('A'), el('B')), state(el('B'), el('A'))), []));
  it('finds what was added and what was removed, by GlobalId', () => {
    assert.deepEqual(only(state(el('A'), el('B')), state(el('B'), el('C'))), [['A', 'removed', ''], ['C', 'added', '']]);
  });
  it('tells a move from a reshape by the box', () => {
    const moved = el('A', { g: 'g2', a: [1, 0, 0, 5, 0.2, 3] });
    const longer = el('B', { g: 'g2', a: [0, 0, 0, 6, 0.2, 3] });
    const both = el('C', { g: 'g2', a: [1, 0, 0, 7, 0.2, 3] });
    assert.deepEqual(only(state(el('A'), el('B'), el('C')), state(moved, longer, both)), [['A', 'moved', ''], ['B', 'reshaped', ''], ['C', 'moved+reshaped', '']]);
  });
  it('does not call a shift inside the tolerance a move', () => {
    const nudged = el('A', { g: 'g2', a: [0.004, 0, 0, 4.004, 0.2, 3] });
    assert.deepEqual(only(state(el('A')), state(nudged)), [['A', 'reshaped', '']]);
    assert.equal(compareStates(state(el('A')), state(nudged), 0.01)[0].kinds.includes('moved'), false);
    assert.equal(compareStates(state(el('A')), state(nudged), 0.001)[0].kinds.includes('moved'), true);
  });
  it('tells a changed property set (not named: the state keeps no hash per set) from changed attributes and a changed type', () => {
    const edited = el('A', { d: 'd2' });
    const retyped = el('B', { d: 'd2', c: { 'attr:core': 'a-B', 'type-assignment': 't1' } });
    const renamed = el('C', { d: 'd2', c: { 'attr:core': 'changed', 'type-assignment': 't0' } });
    assert.deepEqual(only(state(el('A'), el('B'), el('C')), state(edited, retyped, renamed)), [['A', 'property', ''], ['B', 'type', ''], ['C', 'property', 'attributes']]);
  });
  it('carries where an element was and where it is, and its name', () => {
    const [c] = compareStates(state(el('A')), state(el('A', { g: 'g2', a: [1, 0, 0, 5, 0.2, 3] })));
    assert.deepEqual([c.before, c.after, c.name], [[0, 0, 0, 4, 0.2, 3], [1, 0, 0, 5, 0.2, 3], 'Wall A']);
  });
  it('is the same every time, in GlobalId order', () => {
    const a = state(el('C'), el('A')), b = state(el('B'));
    assert.deepEqual(compareStates(a, b), compareStates(a, b));
    assert.deepEqual(compareStates(a, b).map((c) => c.guid), ['A', 'B', 'C']);
  });
});

describe('what a view shows', () => {
  const changes = compareStates(
    state(el('floor', { a: [0, -0.3, 0, 8, 0, 6] }), el('roof', { a: [0, 5, 0, 8, 6, 6] }), el('wall', { a: [0, 0, 0, 8, 2.7, 0.3] }), el('back', { a: [0, 0, 20, 8, 2.7, 20.3] }), el('lifted', { a: [0, 0, 3, 1, 2, 4] })),
    state(el('lifted', { g: 'x', a: [0, 6, 3, 1, 8, 4] }), el('floor', { g: 'x', a: [1, -0.3, 0, 9, 0, 6] }), el('roof', { g: 'x', a: [1, 5, 0, 9, 6, 6] }), el('wall', { d: 'x', c: { 'attr:core': 'n', 'type-assignment': 't0' }, a: [0, 0, 0, 8, 2.7, 0.3] }), el('back', { g: 'x', a: [0, 0, 20, 8, 2.7, 20.3] }), el('new', { a: [2, 0, 2, 3, 2.7, 3] })),
  );
  const names = (band: ReturnType<typeof planBand>) => changesInView(changes, band).map((c) => c.name);
  it('a plan shows from its floor to its cut, and where an element was as well as where it is: not the roof above it', () => {
    assert.deepEqual(names(planBand('p', 0, 1.1)), ['Wall back', 'Wall floor', 'Wall lifted', 'Wall new', 'Wall wall']);
  });
  it('a section shows either side of its cut as far as its depth', () => {
    assert.deepEqual(names(cutBand('s', 'z', 0, 3)), ['Wall floor', 'Wall lifted', 'Wall new', 'Wall roof', 'Wall wall']);
    assert.deepEqual(names(cutBand('s', 'z', 0, 30)).length, 6);
  });
  it('an element with no box is in no view', () => {
    const c = compareStates(state(el('S', { a: undefined, g: undefined })), state(el('S', { a: undefined, g: undefined, d: 'x', c: { 'attr:core': 'n' } })));
    assert.equal(c.length, 1);
    assert.deepEqual(changesInView(c, planBand('p', -99, 99)), []);
  });
});

describe('annotations and sheets', () => {
  const text = (viewId: string, params: Record<string, string>): DraftEntity => newDraft(viewId, 'l', { type: 'text', p: { x: 0, y: 0 }, text: 't', height: 0.25, rotation: 0 }, params);
  const level = newDraft('p', 'l', { type: 'level', p: { x: 0, y: 0 }, value: 0, height: 0.25, ref: { at: { x: 0, y: 0 }, storey: 'S1' } });
  const changes = compareStates(
    state(el('gone'), el('moved'), el('edited'), el('same'), el('S1', { t: 'IfcBuildingStorey', a: undefined, g: undefined })),
    state(el('moved', { g: 'x', a: [3, 0, 0, 7, 0.2, 3] }), el('edited', { d: 'x', c: { 'attr:core': 'n' } }), el('same'), el('S1', { t: 'IfcBuildingStorey', a: undefined, g: undefined, d: 'x', c: { 'attr:core': 'elevation' } })),
  );
  const drafts = [text('p', { labelOf: 'gone' }), text('p', { tagOf: 'moved' }), text('p', { labelOf: 'same' }), text('p', { measures: 'edited' }), level, text('p', {})];
  const impacts = annotationImpacts(drafts, changes);
  it('finds the tag or label whose element is gone, the ones whose element changed, a dimension and a level mark', () => {
    assert.deepEqual(impacts.map((i) => [i.guid, i.how]), [['gone', 'lost'], ['moved', 'changed'], ['edited', 'changed'], ['S1', 'changed']]);
  });
  const sheet = (id: string, number: string, views: string[]): ProjectSheet => ({ id, number, name: number, createdAt: 0, viewports: views.map((v) => ({ id: `vp${v}`, viewId: v, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null })) });
  it('counts each changed element once per sheet and says nothing for a sheet that shows nothing that changed', () => {
    const report = sheetChanges([sheet('s1', 'A-101', ['p', 'p2']), sheet('s2', 'A-201', ['q'])], [planBand('p', 0, 1.1), planBand('p2', 0, 1.1), cutBand('q', 'z', 500, 1)], changes, impacts);
    // gone (removed, box), moved, edited and S1 are on A-101; "same" did not change.
    assert.deepEqual(report.map((r) => [r.number, r.count]), [['A-101', 4], ['A-201', 0]]);
    assert.equal(report[1].views.length + report[1].annotations.length, 0);
  });
});
