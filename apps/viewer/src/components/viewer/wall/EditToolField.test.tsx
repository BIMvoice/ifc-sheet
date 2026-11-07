/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, type } from '@/test/render.js';
import { attachDraftingView, cancelCommand, clickDrawing, patchDraftSettings, startDraftCommand } from '@/drafting/session';
import { clearDraftHistory, draftsOfView, editDrafts, newDraft } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { ToolTypes } from './ToolTypes.js';

/** #168: Offset, Fillet and Chamfer show their number on the tool card; setting it there is what the picks use. */

const VIEW = 'view-168-edit';
const TOL = 0.05;

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  patchDraftSettings({ filletRadius: 0, chamferDistance: 0, offsetDistance: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView(VIEW, 'down', () => []);
});
afterEach(() => cleanup());

const field = (ui: HTMLElement) => ui.querySelector('input[type="number"]') as HTMLInputElement;
const layer = () => useProjectStore.getState().draftLayers[0].id;
const shapes = () => draftsOfView(VIEW).map((d) => d.shape);

function drawCorner() {
  editDrafts({
    add: [
      newDraft(VIEW, layer(), { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }),
      newDraft(VIEW, layer(), { type: 'line', a: { x: 10, y: 0 }, b: { x: 10, y: 10 } }),
    ],
  });
}

describe('the number field on the tool card of Offset, Fillet and Chamfer (#168)', () => {
  it('shows the current value with a label: Radius for Fillet, Distance for Offset and Chamfer', () => {
    patchDraftSettings({ filletRadius: 1.5, chamferDistance: 0.4, offsetDistance: 2 });
    for (const [tool, label, value] of [['fillet', 'Radius', '1.5'], ['chamfer', 'Distance', '0.4'], ['offset', 'Distance', '2']] as const) {
      const ui = render(<ToolTypes tool={tool} />);
      assert.equal(ui.textContent, label, `${tool}: label`);
      assert.equal(field(ui).value, value, `${tool}: value`);
      cleanup();
    }
  });

  it('Fillet: the radius set in the card field is the radius of the corner', () => {
    drawCorner();
    const ui = render(<ToolTypes tool="fillet" />);
    act(() => { startDraftCommand('fillet'); });
    type(field(ui), '2');
    act(() => {
      clickDrawing({ x: 8, y: 0 }, TOL, false);
      clickDrawing({ x: 10, y: 8 }, TOL, false);
    });
    const arc = shapes().find((s) => s.type === 'arc');
    assert.ok(arc && arc.type === 'arc', 'the corner got an arc');
    assert.ok(Math.abs(arc.r - 2) < 1e-6, `the arc radius is 2, got ${arc.r}`);
  });

  it('Offset: the distance set in the card field, during the tool, is the distance of the copy', () => {
    editDrafts({ add: [newDraft(VIEW, layer(), { type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })] });
    const ui = render(<ToolTypes tool="offset" />);
    assert.equal(field(ui).value, '', 'no distance chosen yet: the field is empty');
    act(() => { startDraftCommand('offset'); });
    type(field(ui), '3');
    act(() => {
      clickDrawing({ x: 5, y: 0 }, TOL, false);
      clickDrawing({ x: 5, y: 5 }, TOL, false);
    });
    const lines = shapes().flatMap((s) => (s.type === 'line' ? [s] : []));
    assert.equal(lines.length, 2, 'the original and a copy');
    assert.ok(lines.some((l) => Math.abs(l.a.y - 3) < 1e-6 && Math.abs(l.b.y - 3) < 1e-6), 'the copy is 3 away');
  });

  it('Chamfer: the distance set in the card field cuts the corner by that much', () => {
    drawCorner();
    const ui = render(<ToolTypes tool="chamfer" />);
    act(() => { startDraftCommand('chamfer'); });
    type(field(ui), '2');
    act(() => {
      clickDrawing({ x: 8, y: 0 }, TOL, false);
      clickDrawing({ x: 10, y: 8 }, TOL, false);
    });
    const cut = shapes().flatMap((s) => (s.type === 'line' ? [s] : [])).find((l) => {
      const ends = [l.a, l.b];
      return ends.some((p) => Math.hypot(p.x - 8, p.y) < 1e-6) && ends.some((p) => Math.hypot(p.x - 10, p.y - 2) < 1e-6);
    });
    assert.ok(cut, 'a line from (8, 0) to (10, 2) cuts the corner');
  });
});
