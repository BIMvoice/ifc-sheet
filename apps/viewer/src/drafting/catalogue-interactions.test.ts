/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the section symbol, level marks, annotation types, symbol instances
 * and legends meet: edits that touch several of them at once must keep each
 * one's rule (a section symbol stays locked, LEVELALIGN only reads level marks,
 * a type stamps every dimension of a chain, a sheet prints the current number
 * at the paper size the mark was drawn for).
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateLegend, addLegend, updateLegend } from '@/legend/legend-actions';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addViewport, updateViewport } from '@/project/sheets';
import { annotationAtFactor, annotationFactor } from '@/project/viewport-annotation';
import type { ProjectView } from '@/project/types';
import { clearDraftHistory, newDraft } from './draft-store.js';
import { levelResolverFor } from './level-resolver.js';
import { settleLevelDrafts } from './level-sync.js';
import {
  attachDraftingView, cancelCommand, clickDrawing, patchDraftSettings, pressEnter, setWorkPlaneProvider, startDraftCommand, useDraftingSession,
} from './session.js';
import type { DraftEntity } from './types.js';

const TOL = 0.05;
const planView: ProjectView = { id: 'plan-1', name: 'L0', createdAt: 0, kind: 'plan', level: { name: 'L0', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const drafts = () => useProjectStore.getState().drafts;
const click = (x: number, y: number) => clickDrawing({ x, y }, TOL, false);
const select = (ids: string[]) => useDraftingSession.setState({ selection: new Set(ids) });

function drawSection(): void {
  startDraftCommand('sectionline');
  click(0, 0);
  click(10, 0);
  click(5, 3);
}
function placeSymbolAt(x: number, y: number): DraftEntity {
  patchDraftSettings({ symbolId: 'builtin:north-arrow', symbolScale: 1, symbolRotation: 0 });
  const before = drafts().length;
  startDraftCommand('symbol');
  click(x, y);
  cancelCommand();
  assert.equal(drafts().length, before + 1);
  return drafts().at(-1) as DraftEntity;
}
const instance = (): DraftEntity => drafts().find((d) => d.shape.type === 'symbol') as DraftEntity;

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  patchDraftSettings({ annotationType: null });
  setWorkPlaneProvider(() => ({ axis: 'y', position: 1.2, flipped: false }), () => planView);
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('plan-1', 'down', () => []);
});

describe('a symbol instance next to a section symbol', () => {
  it('moves with a mixed selection while the section symbol stays locked', () => {
    drawSection();
    const sym = placeSymbolAt(20, 20);
    const section = drafts().filter((d) => d.params.sectionOf).map((d) => JSON.stringify(d.shape));
    select(drafts().map((d) => d.id));
    startDraftCommand('move');
    click(0, 0);
    click(2, 5);
    assert.deepEqual(drafts().filter((d) => d.params.sectionOf).map((d) => JSON.stringify(d.shape)), section);
    const moved = drafts().find((d) => d.id === sym.id)?.shape;
    assert.ok(moved?.type === 'symbol');
    assert.deepEqual(moved.p, { x: 22, y: 25 });
    assert.equal(moved.symbolId, 'builtin:north-arrow');
  });

  it('copies as a second instance of the same symbol, and the copy of the section symbol stays plain', () => {
    drawSection();
    placeSymbolAt(20, 20);
    const sectionParts = drafts().filter((d) => d.params.sectionOf).length;
    select(drafts().map((d) => d.id));
    startDraftCommand('copy');
    click(0, 0);
    click(0, 30);
    pressEnter();
    const instances = drafts().filter((d) => d.shape.type === 'symbol');
    assert.equal(instances.length, 2);
    assert.deepEqual(instances.map((d) => d.shape.type === 'symbol' && d.shape.symbolId), ['builtin:north-arrow', 'builtin:north-arrow']);
    assert.equal(drafts().filter((d) => d.params.sectionOf).length, sectionParts, 'only the original claims to be the section');
  });

  it('mirrors to the other side of the axis and the section symbol is left alone', () => {
    drawSection();
    const sym = placeSymbolAt(20, 20);
    const section = drafts().filter((d) => d.params.sectionOf).map((d) => JSON.stringify(d.shape));
    select(drafts().map((d) => d.id));
    startDraftCommand('mirror');
    click(0, 10);
    click(10, 10);
    const mirrored = drafts().filter((d) => d.shape.type === 'symbol');
    assert.equal(mirrored.length, 2, 'the mirror keeps the original and adds the mirrored copy');
    const copy = mirrored.find((d) => d.id !== sym.id)?.shape;
    assert.ok(copy?.type === 'symbol');
    assert.deepEqual(copy.p, { x: 20, y: 0 });
    assert.deepEqual(drafts().filter((d) => d.params.sectionOf && drafts().some((o) => o.id === d.id)).slice(0, section.length).map((d) => JSON.stringify(d.shape)), section);
  });
});

describe('LEVELALIGN', () => {
  it('lines up level marks and leaves a symbol instance in the same selection where it is', () => {
    const a = newDraft('plan-1', '0', { type: 'level', p: { x: 1, y: 2 }, value: 2, height: 0.25 });
    const b = newDraft('plan-1', '0', { type: 'level', p: { x: 5, y: 4 }, value: 4, height: 0.25 });
    useProjectStore.setState({ drafts: [a, b] });
    const sym = placeSymbolAt(8, 8);
    const before = JSON.stringify(sym.shape);
    select([a.id, b.id, sym.id]);
    startDraftCommand('levelalign');
    click(9, 0);
    const level = (id: string) => drafts().find((d) => d.id === id)?.shape;
    assert.deepEqual([level(a.id), level(b.id)].map((s) => s?.type === 'level' && s.p), [{ x: 9, y: 2 }, { x: 9, y: 4 }]);
    assert.equal(JSON.stringify(drafts().find((d) => d.id === sym.id)?.shape), before);
  });

  it('with only a symbol instance selected it changes nothing', () => {
    const sym = placeSymbolAt(8, 8);
    const before = JSON.stringify(drafts());
    select([sym.id]);
    startDraftCommand('levelalign');
    click(9, 0);
    assert.equal(JSON.stringify(drafts()), before);
  });
});

describe('a continuous dimension drawn with an annotation type', () => {
  it('stamps every dimension of the chain with the type', () => {
    patchDraftSettings({ annotationType: { id: 'at-dim', tool: 'dimlinear' } });
    startDraftCommand('dimlinear');
    click(0, 0);
    click(4, 0);
    click(2, 1);
    click(7, 0);
    click(11, 0);
    pressEnter();
    const dims = drafts().filter((d) => d.shape.type === 'dimension');
    assert.equal(dims.length, 3);
    assert.deepEqual(dims.map((d) => d.params.atype), ['at-dim', 'at-dim', 'at-dim']);
  });

  it('a type of another tool does not stamp the chain', () => {
    patchDraftSettings({ annotationType: { id: 'at-text', tool: 'text' } });
    startDraftCommand('dimlinear');
    click(0, 0);
    click(4, 0);
    click(2, 1);
    click(7, 0);
    pressEnter();
    assert.deepEqual(drafts().map((d) => d.params.atype), [undefined, undefined]);
  });
});

describe('a level mark on a sheet', () => {
  it('prints the number its level has now, at the paper size of the viewport scale', () => {
    const view: ProjectView = { ...planView, level: { name: 'L1', elevation: 3, storeyGlobalIds: [] }, scale: 100 };
    const mark = newDraft(view.id, '0', { type: 'level', p: { x: 1, y: 1 }, value: 3, height: 0.25, ref: { at: { x: 1, y: 1 }, storey: 'L1' } });
    const moved = [{ name: 'L1', elevation: 3.4, storeyGlobalIds: [] }];
    const settled = settleLevelDrafts([mark], levelResolverFor(view, moved, undefined));
    const shape = settled[0].shape;
    assert.ok(shape.type === 'level');
    assert.equal(shape.value, 3.4, 'the sheet reads the level now, not the cached number');
    const printed = annotationAtFactor(shape, annotationFactor(50, view.scale));
    assert.ok(printed.type === 'level');
    assert.equal(printed.value, 3.4, 'the paper-size factor does not touch the number');
    assert.equal(printed.height, 0.125, 'a 1:50 viewport of a 1:100 view halves the stored model size');
  });
});

describe('symbols and legends on a sheet', () => {
  it('a paper symbol follows the viewport scale factor and a model symbol keeps its size', () => {
    const paper = { type: 'symbol' as const, symbolId: 'builtin:north-arrow', p: { x: 0, y: 0 }, scale: 0.1, rotation: 0 };
    const model = { ...paper, symbolId: 'builtin:scale-bar', scale: 1 };
    assert.equal((annotationAtFactor(paper, 0.5) as typeof paper).scale, 0.05);
    assert.equal((annotationAtFactor(model, 0.5) as typeof model).scale, 1);
    assert.equal(annotationAtFactor(paper, 1), paper);
  });

  it('a placed legend moves like any viewport and a duplicate has its own configuration', () => {
    useProjectStore.setState({ sheets: [{ id: 'sh', number: 'A-1', name: 'S', createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [] }] });
    const id = addLegend('Key', { scope: 'sheet', scopeId: 'sh' });
    const vp = addViewport('sh', id, { x: 0, y: 0 }, 50);
    assert.ok(vp);
    updateViewport('sh', vp, { x: 123, y: 45 });
    const placed = useProjectStore.getState().sheets[0].viewports?.[0];
    assert.deepEqual([placed?.viewId, placed?.x, placed?.y], [id, 123, 45]);
    const copy = duplicateLegend(id, 'Key 2');
    assert.ok(copy && copy !== id);
    updateLegend(copy, { columns: 3 });
    const legends = useProjectStore.getState().legends ?? [];
    assert.deepEqual(legends.map((l) => l.columns), [1, 3]);
  });
});
