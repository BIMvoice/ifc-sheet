/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafted line prints with the pen the app draws it with (#479, #496): a layer switched off for printing leaves the sheet,
 * a line type of the project's own prints its dash pattern, and the element's own colour, weight and line type win over its layer's.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectView, SheetViewport } from './document.js';
import type { DraftEntity, DraftLayer } from './draft-types.js';
import { readProjectSet } from './project-set.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';

const view = { id: 'v', name: 'Plan', kind: 'plan', createdAt: 0 } as ProjectView;
const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
const line = (layerId: string, params: DraftEntity['params'] = {}): DraftEntity =>
  ({ id: layerId, viewId: 'v', layerId, shape: { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, params }) as DraftEntity;
const circle = (layerId: string, params: DraftEntity['params'] = {}): DraftEntity =>
  ({ id: `${layerId}-c`, viewId: 'v', layerId, shape: { type: 'circle', c: { x: 0, y: 0 }, r: 2 }, params }) as DraftEntity;
const arc = (layerId: string, params: DraftEntity['params'] = {}): DraftEntity =>
  ({ id: `${layerId}-arc`, viewId: 'v', layerId, shape: { type: 'arc', c: { x: 0, y: 0 }, r: 2, start: 0, end: Math.PI / 2 }, params }) as DraftEntity;
const strokes = (layers: DraftLayer[], drafts: DraftEntity[], lineTypes?: SheetAnnotations['lineTypes']) =>
  viewportAnnotations(
    { view, vp, at: (p) => ({ x: 100 + p.x, y: 100 - p.y }), frame: { kx: 1, ky: -1 }, box: null },
    { drafts, layers, groups: [], ...(lineTypes ? { lineTypes } : {}), book: { textStyles: [], dimStyles: [] }, locale: 'en' } as unknown as SheetAnnotations,
  ).strokes;

const layer = (id: string, extra: Partial<DraftLayer> = {}): DraftLayer => ({ id, name: id, color: '#112233', visible: true, locked: false, ...extra });

describe('a drafted line on the sheet', () => {
  it('is left out when its layer does not print', () => {
    const out = strokes([layer('a'), layer('b', { print: false })], [line('a'), line('b')]);
    expect(out).toHaveLength(1);
    expect(out[0].colour).toBe('#112233');
  });

  it('prints the dash pattern of a line type of the project\'s own', () => {
    const [s] = strokes([layer('a', { lineType: 'center' })], [line('a')], [{ id: 'center', name: 'Centre', dash: [6, 1, 1, 1] }]);
    expect(s.dash).toEqual([6, 1, 1, 1]);
  });

  it('takes the element\'s own colour and weight over its layer\'s', () => {
    const [s] = strokes([layer('a', { lineWeight: 0.5 })], [line('a', { 'o.color': '#ff0000', 'o.lineWeight': 0.7 })]);
    expect([s.colour, s.width]).toEqual(['#ff0000', 0.7]);
  });

  it('reads the project\'s line types from the file, refusing a bad pattern', () => {
    expect(readProjectSet({ lineTypes: [{ id: 'c', name: 'C', dash: [4, 1] }] }).lineTypes).toEqual([{ id: 'c', name: 'C', dash: [4, 1] }]);
    expect(() => readProjectSet({ lineTypes: [{ id: 'c', name: 'C', dash: [4, 0] }] })).toThrow(/gaps above zero/);
  });
});

describe('a drafted circle or arc on the sheet (#479)', () => {
  it('is left out when its layer does not print', () => {
    const out = strokes([layer('a'), layer('b', { print: false })], [circle('a'), arc('a'), circle('b'), arc('b')]);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.colour === '#112233')).toBe(true);
  });

  it('prints the dash pattern of a line type of the project\'s own, on its layer or its own', () => {
    const types = [{ id: 'center', name: 'Centre', dash: [6, 1, 1, 1] }, { id: 'phantom', name: 'Phantom', dash: [8, 2] }];
    const out = strokes([layer('a', { lineType: 'center' })], [circle('a'), arc('a'), arc('a', { 'o.lineType': 'phantom' })], types);
    expect(out.map((s) => s.dash)).toEqual([[6, 1, 1, 1], [6, 1, 1, 1], [8, 2]]);
  });

  it('takes the element\'s own colour and weight over its layer\'s', () => {
    const out = strokes([layer('a', { lineWeight: 0.5 })], [circle('a', { 'o.color': '#ff0000', 'o.lineWeight': 0.7 }), arc('a', { 'o.color': '#00ff00' })]);
    expect(out.map((s) => [s.colour, s.width])).toEqual([['#ff0000', 0.7], ['#00ff00', 0.5]]);
  });
});
