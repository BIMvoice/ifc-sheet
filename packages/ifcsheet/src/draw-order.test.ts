/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What draws on top among the drafted elements (#682): the stored order, a layer's order above it, one function for the screen,
 * the sheet and the files. Before, nothing in the engine let a layer stand above another.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectView, SheetViewport } from './document.js';
import type { DraftEntity, DraftLayer } from './draft-types.js';
import { readDraftLayer } from './draft-read.js';
import { inDrawOrder, movedInOrder } from './draw-order.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';

const layer = (id: string, order?: number): DraftLayer => ({ id, name: id, color: '#112233', visible: true, locked: false, ...(order === undefined ? {} : { order }) });
const draft = (id: string, layerId = '0'): DraftEntity => ({ id, viewId: 'v', layerId, shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, params: {} });
const ids = (list: readonly { id: string }[]) => list.map((d) => d.id);

describe('inDrawOrder', () => {
  const drafts = [draft('a', 'low'), draft('b', 'high'), draft('c', 'low'), draft('d', 'none')];

  it('keeps the stored order when no layer is ordered', () => {
    expect(inDrawOrder(drafts, [layer('low'), layer('high'), layer('none')])).toBe(drafts);
  });

  it('puts a layer with a higher order above one with a lower, each in its stored order', () => {
    const order = inDrawOrder(drafts, [layer('low', -1), layer('high', 1), layer('none')]);
    expect(ids(order)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('puts a draft of a layer the project does not have at 0', () => {
    expect(ids(inDrawOrder([draft('x', 'gone'), draft('y', 'up')], [layer('up', 1)]))).toEqual(['x', 'y']);
    expect(ids(inDrawOrder([draft('y', 'up'), draft('x', 'gone')], [layer('up', 1)]))).toEqual(['x', 'y']);
  });
});

describe('movedInOrder', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => draft(id));

  it('brings the moved to the end, keeping their order among themselves', () => {
    expect(ids(movedInOrder(list, new Set(['b', 'a']), 'front'))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('sends them to the start', () => {
    expect(ids(movedInOrder(list, new Set(['d', 'c']), 'back'))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('returns the same list when they are there already or nothing is chosen', () => {
    expect(movedInOrder(list, new Set(['d']), 'front')).toBe(list);
    expect(movedInOrder(list, new Set(['a']), 'back')).toBe(list);
    expect(movedInOrder(list, new Set(), 'front')).toBe(list);
  });
});

describe('a layer\'s order in the file', () => {
  it('is read back as it was written', () => {
    const l = layer('x', 3);
    expect(readDraftLayer(JSON.parse(JSON.stringify(l)), 'l')).toEqual(l);
    expect(readDraftLayer({ id: 'x', name: 'x', order: -2 }, 'l').order).toBe(-2);
  });

  it('is absent from a layer saved before it existed, and from one that says 0 or a non-number', () => {
    for (const order of [undefined, 0, 1.5, 'high', null]) expect(readDraftLayer({ id: 'x', name: 'x', order }, 'l')).not.toHaveProperty('order');
  });
});

describe('the sheet', () => {
  const view = { id: 'v', name: 'Plan', kind: 'plan', createdAt: 0 } as ProjectView;
  const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
  const hatch: DraftEntity = { id: 'h', viewId: 'v', layerId: 'fills', shape: { type: 'hatch', loops: [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]], pattern: 'SOLID', scale: 1, angle: 0 }, params: {} };
  const inks = (layers: DraftLayer[]) => viewportAnnotations(
    { view, vp, at: (p) => ({ x: 100 + p.x, y: 100 - p.y }), frame: { kx: 1, ky: -1 }, box: null },
    { drafts: [hatch, draft('l', 'lines')], layers, groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' } as unknown as SheetAnnotations,
  ).strokes.map((s) => (s.fill ? 'fill' : 'line'));

  it('strokes the drafts in the stored order: a hatch drawn first is under the line drawn after it', () => {
    const out = inks([layer('fills'), layer('lines')]);
    expect(out[0]).toBe('fill');
    expect(out.lastIndexOf('line')).toBeGreaterThan(out.indexOf('fill'));
  });

  it('strokes a layer ordered above another after it, though it was drawn before', () => {
    const out = inks([layer('fills', 1), layer('lines')]);
    expect(out[0]).toBe('line');
    expect(out.indexOf('fill')).toBeGreaterThan(out.indexOf('line'));
  });
});
