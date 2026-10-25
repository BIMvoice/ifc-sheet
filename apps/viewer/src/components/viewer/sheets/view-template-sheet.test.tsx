/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sheet draws a viewport with the graphics its view's template gives it, and hides the drafting layers its own viewport hides
 * (#44): the pens take the template's line colour, and a layer off in one viewport is drawn in the other viewport of the same drawing.
 */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { newDraft } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { DraftLayer } from '@/drafting/types';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetPaper } from './SheetPaper';

const layers: DraftLayer[] = [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }, { id: 'L-dim', name: 'Dimensions', color: '#cc0000', visible: true, locked: false }];
const view = { id: 'v1', name: 'Plan', kind: 'plan', createdAt: 0, level: { name: 'L', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2, templateId: 'vt' } as ProjectView;
const vp = (id: string, extra: Partial<SheetViewport> = {}): SheetViewport => ({ id, viewId: 'v1', x: 150, y: 100, scale: 100, width: 200, height: 150, center: { x: 5, y: 5 }, ...extra });
const sheet = (viewports: SheetViewport[]): ProjectSheet => ({ id: 's1', number: 'A-101', name: 'Plans', createdAt: 1, paper: 'A3', orientation: 'landscape', titleBlock: {}, viewports }) as ProjectSheet;
const wall = { bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } }, config: { plane: { axis: 'y' } }, cutPolygons: [], lines: [{ entityId: 1, ifcType: 'IfcWall', category: 'cut', visibility: 'visible', line: { start: { x: 1, y: 1 }, end: { x: 4, y: 1 } } }] } as unknown as Drawing2D;
const drafts = [newDraft('v1', '0', { type: 'line', a: { x: 1, y: 2 }, b: { x: 4, y: 2 } }), newDraft('v1', 'L-dim', { type: 'line', a: { x: 1, y: 3 }, b: { x: 4, y: 3 } })];

beforeEach(() => resetProject());
afterEach(() => cleanup());

function paper(viewports: SheetViewport[]): HTMLElement {
  return render(<SheetPaper sheet={sheet(viewports)} projectName="P" layers={layers} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view, drawing: wall, drafts })} />);
}
const strokes = (ui: ParentNode, vpId: string): string[] => [...ui.querySelectorAll(`[data-viewport-id="${vpId}"] path`)].map((p) => p.getAttribute('stroke') ?? '');

describe('the sheet draws what a view template says (#44)', () => {
  it('pens the walls in the template\'s line colour; a view with no such template keeps the default', () => {
    useProjectStore.setState({ viewTemplates: [{ id: 'vt', name: 'Plans', kind: 'plan', graphics: { categories: { walls: { lineColor: '#ff0000' } } } }] });
    assert.ok(strokes(paper([vp('a')]), 'a').includes('#ff0000'), 'the wall line is red');
    cleanup();
    useProjectStore.setState({ viewTemplates: [] });
    assert.equal(strokes(paper([vp('a')]), 'a').includes('#ff0000'), false);
  });

  it('a template edited redraws the sheet', () => {
    useProjectStore.setState({ viewTemplates: [{ id: 'vt', name: 'Plans', kind: 'plan', graphics: {} }] });
    const ui = paper([vp('a')]);
    assert.equal(strokes(ui, 'a').includes('#00aa00'), false);
    act(() => useProjectStore.setState({ viewTemplates: [{ id: 'vt', name: 'Plans', kind: 'plan', graphics: { categories: { walls: { lineColor: '#00aa00' } } } }] }));
    assert.ok(strokes(ui, 'a').includes('#00aa00'));
  });
});

describe('the sheet hides the layers its viewport hides (#44)', () => {
  it('a layer off in one viewport is drawn in the other viewport of the same drawing', () => {
    const ui = paper([vp('a', { hiddenLayers: ['L-dim'] }), vp('b', { x: 150, y: 300 })]);
    const layerCount = (id: string) => ui.querySelectorAll(`[data-viewport-id="${id}"] path`).length;
    assert.equal(layerCount('b') - layerCount('a'), 1, 'the other viewport draws the dimension line this one hides');
  });
});
