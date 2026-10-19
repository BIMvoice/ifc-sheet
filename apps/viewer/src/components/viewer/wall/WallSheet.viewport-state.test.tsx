/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { patchViewDrawing, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { sheetDxf } from '../sheets/sheet-dxf.js';
import { sheetSvgText } from '../sheets/sheet-export.js';
import { WallSheet } from './WallSheet.js';

/**
 * A view that cannot be drawn says why on its viewport, and only there: the
 * overlay is screen-only, so the paper every export reads is the same with
 * and without it.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const vp: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 50, width: 0, height: 0, center: null };
const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] };
const REASON = 'This view cannot resolve: its level is not in the loaded models.';

beforeEach(() => {
  resetProject();
  useViewDrawings.setState({ byView: {} });
  useProjectStore.setState({ views: [plan], sheets: [sheet] });
});
afterEach(() => cleanup());

const paper = (ui: HTMLElement) => {
  const svg = ui.querySelector<SVGSVGElement>('svg[data-sheet-id]');
  assert.ok(svg);
  return svg;
};

describe('the viewport state on a sheet', () => {
  it('shows the reason a view failed on its viewport', () => {
    const ui = render(<WallSheet sheet={sheet} width={1000} />);
    assert.equal(ui.querySelector('[data-viewport-overlay]'), null);
    act(() => patchViewDrawing('p', { status: 'error', error: REASON }));
    const overlay = ui.querySelector('[data-viewport-overlay="vp"]');
    assert.ok(overlay);
    assert.match(overlay.textContent ?? '', new RegExp(REASON.replace(/[.]/g, '\\.')));
    assert.equal(overlay.querySelector('[data-viewport-state]')?.getAttribute('data-viewport-state'), 'failed');
  });

  it('shows generating and an empty cut', () => {
    const ui = render(<WallSheet sheet={sheet} width={1000} />);
    act(() => patchViewDrawing('p', { status: 'generating', progress: 40, phase: 'Cutting' }));
    assert.match(ui.querySelector('[data-viewport-overlay]')?.textContent ?? '', /Cutting 40%/);
    act(() => patchViewDrawing('p', { status: 'ready', drawing: null }));
    assert.match(ui.querySelector('[data-viewport-overlay]')?.textContent ?? '', /Nothing is cut at this height/);
  });

  it('keeps every overlay out of the SVG and out of PDF and DXF', () => {
    const ui = render(<WallSheet sheet={sheet} width={1000} />);
    const before = { svg: sheetSvgText(paper(ui), sheet), dxf: sheetDxf(paper(ui), sheet) };
    act(() => patchViewDrawing('p', { status: 'error', error: REASON }));
    assert.ok(ui.querySelector('[data-viewport-overlay]'), 'the overlay is on screen');
    const svg = paper(ui);
    // ok(), not equal(): a failure would otherwise try to print a DOM node.
    assert.ok(svg.querySelector('[data-viewport-overlay], [data-viewport-state]') === null, 'no overlay inside the paper SVG');
    const text = sheetSvgText(svg, sheet);
    assert.ok(!text.includes('could not be made') && !text.includes('cannot resolve') && !text.includes('data-viewport-overlay') && !text.includes('data-viewport-state'));
    // Compared with ok(), not equal(): a mismatch would otherwise diff two whole sheets.
    assert.ok(text === before.svg, 'the SVG is the same with the failure shown');
    assert.ok(Buffer.from(sheetDxf(svg, sheet)).equals(Buffer.from(before.dxf)), 'the DXF is the same with the failure shown');
  });
});
