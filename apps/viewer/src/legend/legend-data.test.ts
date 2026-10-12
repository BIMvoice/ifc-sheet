/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What a legend lists: only what is used in its scope, in its categories, in its order. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectSheet, ProjectView } from '@/project/types';
import type { AnnotationType } from '@/catalogue/types';
import { legendGroups, scopeViewIds, scopeViews, type LegendSource } from './legend-data.js';

const layers: DraftLayer[] = [
  { id: '0', name: '0', color: '#000000', visible: true, locked: false },
  { id: 'wall', name: 'A-WALL', color: '#aa0000', visible: true, locked: false, lineWeight: 0.5, lineType: 'dashed' },
  { id: 'off', name: 'A-OFF', color: '#00aa00', visible: false, locked: false },
  { id: 'unused', name: 'A-UNUSED', color: '#0000aa', visible: true, locked: false },
];
const line = (id: string, viewId: string, layerId: string, params: DraftEntity['params'] = {}): DraftEntity => ({ id, viewId, layerId, shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, params });
const types: AnnotationType[] = [{ id: 'a1', name: 'Door tag', tool: 'tag' }, { id: 'a2', name: 'Grid', tool: 'axis' }];

const source: LegendSource = {
  materials: [
    { name: 'Concrete', hatch: 'CONCRETE', hatchScale: 2 },
    { name: 'concrete ', hatch: 'CONCRETE' },
    { name: 'PE foil', membrane: true, hatch: null },
    { name: 'Plaster', hatch: null },
    { name: 'Brick', hatch: 'BRICK', fill: '#cc8866' },
  ],
  layers,
  drafts: [
    line('1', 'v1', 'wall'), line('2', 'v1', 'off'), line('3', 'v1', '0', { atype: 'a1' }),
    { id: '4', viewId: 'v1', layerId: '0', params: { atype: 'a1' }, shape: { type: 'symbol', symbolId: 'builtin:north-arrow', p: { x: 0, y: 0 }, scale: 1, rotation: 0 } },
    { id: '5', viewId: 'v1', layerId: '0', params: {}, shape: { type: 'symbol', symbolId: 'mine', p: { x: 0, y: 0 }, scale: 1, rotation: 0 } },
    { id: '6', viewId: 'v1', layerId: '0', params: {}, shape: { type: 'symbol', symbolId: 'gone', p: { x: 0, y: 0 }, scale: 1, rotation: 0 } },
    { id: '7', viewId: 'v1', layerId: '0', params: {}, shape: { type: 'hatch', loops: [], pattern: 'brick', scale: 3, angle: 0 } },
    { id: '8', viewId: 'v1', layerId: '0', params: {}, shape: { type: 'hatch', loops: [], pattern: 'BRICK', scale: 1, angle: 0 } },
  ],
  annotationTypes: types,
  symbols: [{ id: 'mine', name: 'Bollard', unit: 'model', shapes: [] }],
};
const all = ['materials', 'layers', 'hatches', 'symbols', 'annotations'] as const;

describe('legend entries', () => {
  it('lists the cut materials that draw something, once each, by name', () => {
    const [g] = legendGroups({ categories: ['materials'] }, source);
    assert.deepEqual(g.entries.map((e) => e.name), ['Brick', 'Concrete', 'PE foil']);
    assert.deepEqual(g.entries.map((e) => e.category === 'materials' && [e.hatch, e.membrane, e.fill]), [['BRICK', false, '#cc8866'], ['CONCRETE', false, null], [null, true, null]]);
  });

  it('lists the layers that are used, shown, by name, with their pen', () => {
    const [g] = legendGroups({ categories: ['layers'] }, source);
    assert.deepEqual(g.entries.map((e) => e.name), ['0', 'A-WALL']);
    assert.deepEqual(g.entries[1], { category: 'layers', name: 'A-WALL', color: '#aa0000', weight: 0.5, lineType: 'dashed' });
    assert.deepEqual(legendGroups({ categories: ['layers'] }, { ...source, hiddenLayers: new Set(['wall']) })[0].entries.map((e) => e.name), ['0']);
  });

  it('lists each hatch pattern drawn once, whatever the case', () => {
    const [g] = legendGroups({ categories: ['hatches'] }, source);
    assert.deepEqual(g.entries.map((e) => [e.name, e.category === 'hatches' && e.scale]), [['BRICK', 3]]);
  });

  it('lists the symbols placed (built-in and the project\'s), and skips an instance whose symbol is gone', () => {
    const [g] = legendGroups({ categories: ['symbols'] }, source);
    assert.deepEqual(g.entries.map((e) => e.name), ['Bollard', 'North arrow']);
  });

  it('lists the annotation types that stamped something', () => {
    const [g] = legendGroups({ categories: ['annotations'] }, source);
    assert.deepEqual(g.entries.map((e) => e.name), ['Door tag']);
  });

  it('follows the categories chosen and their order, and omits a category with nothing in it', () => {
    assert.deepEqual(legendGroups({ categories: ['symbols', 'layers'] }, source).map((g) => g.category), ['symbols', 'layers']);
    assert.deepEqual(legendGroups({ categories: [...all] }, { ...source, materials: [] }).map((g) => g.category), ['layers', 'hatches', 'symbols', 'annotations']);
    assert.deepEqual(legendGroups({ categories: [] }, source), []);
  });

  it('regenerates from what the project holds now: change the source, the legend changes', () => {
    const before = legendGroups({ categories: ['layers'] }, source)[0].entries.length;
    const after = legendGroups({ categories: ['layers'] }, { ...source, drafts: [...source.drafts, line('9', 'v1', 'unused')] })[0].entries.length;
    assert.equal(after, before + 1);
  });
});

describe('legend scope', () => {
  const views = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }] as ProjectView[];
  const sheets: ProjectSheet[] = [{ id: 'sh', number: 'A-1', name: 'S', createdAt: 0, viewports: [{ id: 'p', viewId: 'v1', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }, { id: 'q', viewId: 'v2', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] }];

  it('project: everything', () => {
    assert.equal(scopeViewIds({ scope: 'project' }, sheets), null);
    assert.equal(scopeViews({ scope: 'project' }, views, sheets).length, 3);
  });
  it('view: that view only; without one, everything', () => {
    assert.deepEqual([...scopeViewIds({ scope: 'view', scopeId: 'v2' }, sheets)!], ['v2']);
    assert.equal(scopeViewIds({ scope: 'view' }, sheets), null);
  });
  it('sheet: the sheet itself and the views on it; a legend with no sheet chosen follows the one it is placed on', () => {
    assert.deepEqual([...scopeViewIds({ scope: 'sheet', scopeId: 'sh' }, sheets)!].sort(), ['sh', 'v1', 'v2']);
    assert.deepEqual([...scopeViewIds({ scope: 'sheet' }, sheets, 'sh')!].sort(), ['sh', 'v1', 'v2']);
    assert.equal(scopeViewIds({ scope: 'sheet' }, sheets), null);
    assert.equal(scopeViewIds({ scope: 'sheet', scopeId: 'deleted' }, sheets)!.size, 0);
    assert.deepEqual(scopeViews({ scope: 'sheet', scopeId: 'sh' }, views, sheets).map((v) => v.id), ['v1', 'v2']);
  });
});
