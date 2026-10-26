/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { clearDraftHistory } from '@/drafting/draft-store';
import { removeProjectItem, resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { defaultViews } from '@/project/view-defaults';
import type { ModelExtent } from '@/project/drawing-set';
import { click } from '@/test/render.js';
import { WallGrid } from './WallGrid.js';
import { useState } from 'react';
import { SteppedSheet } from './SteppedSheet.js';
import { paperOf } from '@/project/sheets';
import { SET_SCALES } from '@/project/drawing-set';
import { SheetCanvas } from './SheetCanvas.js';
import { ScaleField } from './ScaleField.js';
import { useSheetContent } from '../sheets/useSheetContent.js';

/**
 * #51, the Done-when sequence on the Wall: remove a sheet, change a drawing's scale, move a drawing, then three Ctrl+Z and
 * three redos, each pressed as a key on the window, which is where the sheet's `useDraftingKeys` listens. Nothing here calls
 * an undo function: the keys reach `undoLatest` / `redoEarliest` the way a person's do.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
const state = () => useProjectStore.getState();
const slot = () => state().sheets[0].viewports![0];
const numbers = () => state().sheets.map((s) => s.number);

function Wall() {
  const sheet = useProjectStore((s) => s.sheets[0]);
  const content = useSheetContent(sheet);
  const vp = sheet.viewports![0];
  return (
    <>
      <SheetCanvas sheet={sheet} sheetContent={content} chosenId={vp.id} onChoose={() => {}} onOpen={() => {}} onNudge={() => {}} fitKey={0} />
      <ScaleField sheet={sheet} slot={vp} view={state().views.find((v) => v.id === vp.viewId)} bounds={null} />
    </>
  );
}

const ctrlZ = () => press(window, 'z', { ctrlKey: true });
const ctrlShiftZ = () => press(window, 'Z', { ctrlKey: true, shiftKey: true });
const ctrlY = () => press(window, 'y', { ctrlKey: true });

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

function sequence(redo: () => void): void {
  const ui = render(<Wall />);
  const target = state().sheets.find((s, i) => i > 0 && /^A-2/.test(s.number)) ?? state().sheets.at(-1)!;
  const removed = target.number;
  const start = { x: slot().x, y: slot().y, scale: slot().scale };
  const sheetsBefore = numbers();
  clearDraftHistory();

  removeProjectItem(target.id);
  assert.equal(numbers().includes(removed), false);
  const select = ui.querySelector('select');
  assert.ok(select);
  const scale = start.scale === 200 ? '100' : '200';
  act(() => { select.value = scale; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.equal(slot().scale, Number(scale));
  press(window, 'ArrowRight');
  assert.equal(slot().x, start.x + 1);
  const done = { x: slot().x, scale: slot().scale };

  ctrlZ();
  assert.equal(slot().x, start.x, 'the first Ctrl+Z puts the viewport back');
  assert.equal(slot().scale, Number(scale));
  ctrlZ();
  assert.equal(slot().scale, start.scale, 'the second puts the scale back');
  assert.equal(numbers().includes(removed), false, 'the sheet is still gone');
  ctrlZ();
  assert.deepEqual(numbers(), sheetsBefore, 'the third brings the removed sheet back, in its place');
  ctrlZ();
  assert.deepEqual(numbers(), sheetsBefore, 'a fourth has nothing left to take back');

  redo();
  assert.equal(numbers().includes(removed), false, 'redo removes it again first');
  redo();
  assert.equal(slot().scale, done.scale);
  assert.equal(slot().x, start.x);
  redo();
  assert.equal(slot().x, done.x, 'and the move last');
  assert.equal(slot().scale, done.scale);
}

describe('undo and redo on the Wall (#51)', () => {
  it('three Ctrl+Z undo the removal, the scale and the move in order, and three Ctrl+Y redo them', () => sequence(ctrlY));
  it('the same with Ctrl+Shift+Z as redo', () => sequence(ctrlShiftZ));
});

describe('undo and redo on the whole wall (#51)', () => {
  it('Ctrl+Z brings back a sheet taken away with its cross, and Ctrl+Y (and Ctrl+Shift+Z) take it away again', () => {
    const ui = render(<WallGrid extent={HOUSE} onStep={() => {}} />);
    const before = numbers();
    clearDraftHistory();
    const cross = ui.querySelector<HTMLButtonElement>('button[aria-label^="Remove A-202"]');
    assert.ok(cross, 'the A-202 cross');
    click(cross);
    assert.equal(numbers().includes('A-202'), false);
    ctrlZ();
    assert.deepEqual(numbers(), before, 'Ctrl+Z puts A-202 back, in its place');
    ctrlY();
    assert.equal(numbers().includes('A-202'), false);
    ctrlZ();
    ctrlShiftZ();
    assert.equal(numbers().includes('A-202'), false);
  });
});

/** The Wall as the app shows it: the grid, or a sheet stepped into from it. */
function WallAndSheet() {
  const [stepped, setStepped] = useState<string | null>(null);
  const sheet = useProjectStore((s) => s.sheets.find((x) => x.id === stepped));
  return sheet
    ? <SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} onBack={() => setStepped(null)} onStep={setStepped} />
    : <WallGrid extent={HOUSE} onStep={setStepped} />;
}

describe('the Done-when of #51, on the demo set', () => {
  it('remove A-202, change the plans\' scale, move a viewport: three Ctrl+Z bring each back in reverse order, and redo replays them', () => {
    const ui = render(<WallAndSheet />);
    const plans = () => state().sheets.find((s) => s.number === 'A-101')!;
    const vps = () => plans().viewports!;
    const start = { numbers: numbers(), scale: vps()[0].scale, at: vps().map((v) => [v.x, v.y]) };
    clearDraftHistory();

    // 1. Remove A-202 with its cross, on the whole Wall.
    click(ui.querySelector<HTMLButtonElement>('button[aria-label^="Remove A-202"]')!);
    assert.equal(numbers().includes('A-202'), false);

    // 2. The plans' scale, on the scale chips.
    const chips = [...ui.querySelectorAll<HTMLButtonElement>('fieldset button')];
    const plansChips = chips.filter((b) => b.closest('fieldset')?.querySelector('legend')?.textContent?.toLowerCase().includes('plan'));
    assert.ok(plansChips.length > 0, 'the plans\' scale chips');
    const other = SET_SCALES.find((n) => n !== start.scale)!;
    click(plansChips.find((b) => b.textContent === `1 : ${other}`)!);
    assert.equal(vps()[0].scale, other);
    const scaled = vps().map((v) => [v.x, v.y]);

    // 3. Step into the plans sheet, choose its first drawing with a click, and move it with the arrow key.
    act(() => { ui.querySelector('button[aria-label^="A-101"]')!.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); });
    const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
    assert.ok(canvas, 'stepped into the sheet');
    const paper = paperOf(plans());
    const k = Math.min((1280 - 24) / paper.w, (800 - 24) / paper.h);
    const x0 = (1280 - paper.w * k) / 2;
    const y0 = (800 - paper.h * k) / 2;
    const first = vps()[0];
    const at = { clientX: x0 + first.x * k, clientY: y0 + first.y * k };
    for (const type of ['pointerdown', 'pointerup']) act(() => { canvas.dispatchEvent(new window.PointerEvent(type, { ...at, bubbles: true, button: 0, pointerId: 1 })); });
    press(window, 'ArrowRight');
    assert.equal(vps()[0].x, first.x + 1, 'the drawing moved by 1 mm');
    const moved = vps().map((v) => [v.x, v.y]);

    // Three Ctrl+Z, in reverse order.
    ctrlZ();
    assert.deepEqual(vps().map((v) => [v.x, v.y]), scaled, 'the move is undone first');
    assert.equal(vps()[0].scale, other);
    ctrlZ();
    assert.equal(vps()[0].scale, start.scale, 'then the scale');
    assert.deepEqual(vps().map((v) => [v.x, v.y]), start.at);
    assert.equal(numbers().includes('A-202'), false);
    ctrlZ();
    assert.deepEqual(numbers(), start.numbers, 'then A-202 is back, in its place');

    // Redo with Ctrl+Shift+Z, as the Done-when says: the removal, the scale, the move.
    ctrlShiftZ();
    assert.equal(numbers().includes('A-202'), false);
    assert.equal(vps()[0].scale, start.scale);
    ctrlShiftZ();
    assert.equal(vps()[0].scale, other);
    assert.deepEqual(vps().map((v) => [v.x, v.y]), scaled);
    ctrlShiftZ();
    assert.deepEqual(vps().map((v) => [v.x, v.y]), moved);
    assert.equal(numbers().includes('A-202'), false);
  });
});
