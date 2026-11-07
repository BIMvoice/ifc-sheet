/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import type { ModelExtent } from '@/project/drawing-set';
import { resetProject, useProjectStore } from '@/project/project-store';
import { dropSize } from '@/project/viewport-drop';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetCanvas } from './SheetCanvas.js';
import { ViewportCard } from './ViewportCard.js';
import { useSheetContent } from '../sheets/useSheetContent.js';

/**
 * #168: a view dragged from the card's "Place on this sheet" list onto the paper, wired as `SteppedSheet` wires them. The
 * layout stub makes the canvas 1280 x 800: an A2 sheet fits at K px per mm. The building is 20 x 10 m on plan, so the plan
 * at 1:50 is 400 x 200 mm on the paper. B (100 x 80, centre 380, 150) is already on the sheet.
 */

const extent: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 6, z: 10 } };
const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, scale: 50, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const placedView: ProjectView = { id: 'q', kind: 'plan', name: 'Upper', createdAt: 0, scale: 50, level: { name: 'Upper', elevation: 3, storeyGlobalIds: [] }, cutHeight: 1.2 };
const b: SheetViewport = { id: 'b', viewId: 'q', x: 380, y: 150, scale: 50, width: 100, height: 80, center: null };
const K = 776 / 420;
const X0 = (1280 - 594 * K) / 2;
const Y0 = 12;
const at = (x: number, y: number) => ({ clientX: X0 + x * K, clientY: Y0 + y * K });

let chosen: string | null = null;
function Harness() {
  const sheet = useProjectStore((s) => s.sheets[0]);
  const views = useProjectStore((s) => s.views);
  const content = useSheetContent(sheet);
  const [dragViewId, setDragViewId] = useState<string | null>(null);
  return (
    <>
      <SheetCanvas sheet={sheet} sheetContent={content} chosenId={chosen} onChoose={(id) => { chosen = id; }} onOpen={() => {}} onNudge={() => {}} fitKey={0} dropView={views.find((v) => v.id === dragViewId) ?? null} extent={extent} />
      <ViewportCard sheet={sheet} slot={null} onOpen={() => {}} onChoose={(id) => { chosen = id; }} extent={extent} onDragView={setDragViewId} />
    </>
  );
}

/** A browser's drag data, as far as the drag uses it. */
function transfer() {
  const data = new Map<string, string>();
  return {
    get types() { return [...data.keys()]; },
    setData: (type: string, value: string) => { data.set(type, value); },
    getData: (type: string) => data.get(type) ?? '',
    dropEffect: 'none',
    effectAllowed: 'all',
  };
}
type Transfer = ReturnType<typeof transfer>;
function drag(el: Element, type: string, dt: Transfer, p: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 }): void {
  const ev = new window.MouseEvent(type, { ...p, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: dt });
  act(() => { el.dispatchEvent(ev); });
}
const canvas = (ui: HTMLElement) => {
  const el = ui.querySelector('[data-sheet-canvas]');
  assert.ok(el);
  return el;
};
const item = (ui: HTMLElement, viewId: string) => {
  const el = ui.querySelector<HTMLButtonElement>(`[data-place-item="${viewId}"]`);
  assert.ok(el, `${viewId} is offered`);
  return el;
};
/** The outline as drawn, or null (never the element itself in an assertion: printing a DOM node runs out of memory). */
const outline = (ui: HTMLElement) => ui.querySelector('[data-drop-outline]');
const outlined = (ui: HTMLElement): boolean => outline(ui) !== null;
const viewports = () => useProjectStore.getState().sheets[0].viewports ?? [];

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  chosen = null;
  const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [b] };
  useProjectStore.setState({ views: [plan, placedView], sheets: [sheet] });
});
afterEach(() => cleanup());

describe('dragging a view onto a sheet (#168)', () => {
  it('shows its outline at true size while over the paper, snapped beside the drawing already there, with the guide', () => {
    const ui = render(<Harness />);
    assert.equal(item(ui, 'p').getAttribute('draggable'), 'true', 'a plan can be dragged');
    const dt = transfer();
    drag(item(ui, 'p'), 'dragstart', dt);
    // Its right edge (x + 200) 3 mm short of B's left edge (330): within the 8 px tolerance.
    drag(canvas(ui), 'dragover', dt, at(127, 150));
    const box = outline(ui);
    assert.ok(box, 'the outline shows');
    const size = dropSize(plan, extent, 50);
    assert.deepEqual([Number(box.getAttribute('width')), Number(box.getAttribute('height'))], [size.width, size.height], '400 x 200 mm, the plan at 1:50');
    assert.equal(Number(box.getAttribute('x')) + size.width, 330, 'edge to edge with B');
    assert.equal(ui.querySelector('[data-snap-guide="x"]') !== null, true, 'the guide shows');
    assert.deepEqual(viewports().map((v) => v.id), ['b'], 'nothing is placed before it is let go');
  });

  it('places it where it is let go, chosen, as one undo step', () => {
    const ui = render(<Harness />);
    const dt = transfer();
    const source = item(ui, 'p');
    drag(source, 'dragstart', dt);
    drag(canvas(ui), 'dragover', dt, at(127, 150));
    drag(canvas(ui), 'drop', dt, at(127, 150));
    drag(source, 'dragend', dt);
    assert.equal(ui.querySelector('[data-place-item="p"]') === null, true, 'it is no longer offered: it is on the sheet');
    const added = viewports().find((v) => v.viewId === 'p');
    assert.ok(added, 'it is on the sheet');
    assert.deepEqual([added.x, added.y, added.scale], [130, 150, 50], 'where the outline was, at the view\'s scale');
    assert.equal(chosen, added.id, 'and chosen, so its card is up');
    assert.equal(outlined(ui), false, 'the outline goes');
    act(() => { undoDrafts(); });
    assert.deepEqual(viewports().map((v) => v.id), ['b'], 'one undo takes it off again');
  });

  it('places nothing when let go off the paper, or when the drag ends elsewhere', () => {
    const ui = render(<Harness />);
    const dt = transfer();
    drag(item(ui, 'p'), 'dragstart', dt);
    drag(canvas(ui), 'dragover', dt, at(-20, 150));
    assert.equal(outlined(ui), false, 'no outline off the paper');
    drag(canvas(ui), 'drop', dt, at(-20, 150));
    assert.deepEqual(viewports().map((v) => v.id), ['b']);
    drag(canvas(ui), 'dragover', dt, at(127, 150));
    assert.equal(outlined(ui), true);
    drag(item(ui, 'p'), 'dragend', dt);
    assert.equal(outlined(ui), false, 'a drag ended (Esc, or let go elsewhere) leaves no outline behind');
    assert.deepEqual(viewports().map((v) => v.id), ['b']);
  });

  it('still places a click in the middle of the drawing area', () => {
    const ui = render(<Harness />);
    act(() => { item(ui, 'p').click(); });
    assert.equal(viewports().length, 2);
    assert.equal(chosen, viewports()[1].id);
  });
});
