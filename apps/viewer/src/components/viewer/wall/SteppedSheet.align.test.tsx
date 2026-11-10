/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateDefaultSet, type ModelExtent } from '@bimvoice/ifcsheet';
import { openModel } from '@bimvoice/ifcsheet/headless';
import { cleanup, click, render } from '@/test/render.js';
import { FZK_HAUS, planModelMissing, serveWasmFromDisk } from '@/test/discipline-plan-fixture';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { buildWallCommands } from '@/components/viewer/commandPaletteCommandsWall';
import { resetProject, useProjectStore } from '@/project/project-store';
import { dropSize } from '@/project/viewport-drop';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SteppedSheet } from './SteppedSheet.js';
import { fitWidth } from './sheet-fit.js';
import { availableWallCommands, runWallCommand } from './wall-key-bus.js';

/**
 * #168: lining drawings up on a sheet. Three drawings of AC20-FZK-Haus (its ground floor plan and two elevations, each as big
 * on the paper as the model makes it at 1:100) are chosen with Shift+click, lined up and spaced, through the card's buttons and
 * the palette's actions, which are the same actions.
 */

const SHEET = 's';
const positions = { v1: { x: 150, y: 160 }, v2: { x: 420, y: 330 }, v3: { x: 700, y: 200 } } as const;

describe('lining drawings up on a sheet (#168), on AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let extent: ModelExtent;
  let views: ProjectView[];
  let viewports: SheetViewport[];

  before(async () => {
    serveWasmFromDisk();
    const model = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    assert.ok(model.extent, 'the engine measures the building');
    extent = model.extent;
    const set = generateDefaultSet(model);
    assert.ok(set, 'the engine lays out a set');
    const plan = set.document.views.find((v) => v.kind === 'plan' && !v.site);
    const elevations = set.document.views.filter((v) => v.kind === 'elevation');
    assert.ok(plan && elevations.length >= 2, 'the set has a plan and two elevations');
    views = [plan, elevations[0], elevations[1]];
    viewports = views.map((v, i): SheetViewport => {
      const size = dropSize(v, extent, 100);
      const id = `v${i + 1}`;
      return { id, viewId: v.id, scale: 100, center: null, ...positions[id as keyof typeof positions], ...size };
    });
  });
  beforeEach(() => {
    resetProject();
    clearDraftHistory();
    const sheet: ProjectSheet = { id: SHEET, number: 'A-101', name: 'Free', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports };
    useProjectStore.setState({ views, sheets: [sheet] });
  });
  afterEach(() => cleanup());

  const vp = (id: string): SheetViewport => {
    const found = useProjectStore.getState().sheets[0].viewports?.find((v) => v.id === id);
    assert.ok(found, id);
    return found;
  };
  const centres = () => Object.fromEntries(['v1', 'v2', 'v3'].map((id) => [id, { x: vp(id).x, y: vp(id).y }]));
  const left = (id: string) => vp(id).x - vp(id).width / 2;
  const right = (id: string) => vp(id).x + vp(id).width / 2;

  /** Mount the sheet and return what is needed to point at a drawing's centre. */
  function mount() {
    const sheet = useProjectStore.getState().sheets[0];
    const ui = render(<SteppedSheet sheet={sheet} extent={extent} proposals={[]} onBack={() => {}} onStep={() => {}} />);
    const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
    assert.ok(canvas);
    const width = fitWidth(canvas);
    const paper = paperOf(sheet);
    const k = Math.min((width - 24) / paper.w, (800 - 24) / paper.h);
    const x0 = (width - paper.w * k) / 2;
    const y0 = (800 - paper.h * k) / 2;
    const pick = (id: string, shift: boolean): void => {
      const p = { clientX: x0 + vp(id).x * k, clientY: y0 + vp(id).y * k, bubbles: true, button: 0, pointerId: 1, shiftKey: shift };
      act(() => { canvas.dispatchEvent(new window.PointerEvent('pointerdown', p)); });
      act(() => { canvas.dispatchEvent(new window.PointerEvent('pointerup', p)); });
    };
    return { ui, pick };
  }
  const button = (ui: HTMLElement, id: string) => {
    const el = ui.querySelector<HTMLButtonElement>(`[data-arrange="${id}"]`);
    assert.ok(el, `${id} is a button of the card`);
    return el;
  };
  const showsCard = (ui: HTMLElement): boolean => ui.querySelector('[data-align-card]') !== null;

  it('Shift+click adds drawings to the chosen ones; a plain click chooses one again and the card goes', () => {
    const { ui, pick } = mount();
    pick('v1', false);
    assert.equal(showsCard(ui), false, 'one drawing chosen: its own card');
    pick('v2', true);
    assert.equal(showsCard(ui), true, 'two chosen: the line-up card');
    assert.equal(button(ui, 'wall.distribute.across').disabled, true, 'spacing needs three');
    pick('v3', true);
    assert.equal(button(ui, 'wall.distribute.across').disabled, false);
    pick('v3', true);
    assert.equal(button(ui, 'wall.distribute.across').disabled, true, 'Shift+click on a chosen one takes it out');
    pick('v2', false);
    assert.equal(showsCard(ui), false, 'a plain click is a single choice as before');
    assert.deepEqual(centres(), { v1: positions.v1, v2: positions.v2, v3: positions.v3 }, 'choosing moves nothing');
  });

  it('align left lines the others up with the first chosen, which stays; one undo puts all back', () => {
    const { ui, pick } = mount();
    const before = centres();
    pick('v1', false);
    pick('v2', true);
    pick('v3', true);
    click(button(ui, 'wall.align.left'));
    assert.deepEqual(vp('v1'), { ...vp('v1'), ...before.v1 }, 'the anchor stays');
    assert.ok(Math.abs(left('v2') - left('v1')) < 1e-6, 'v2 on the anchor\'s left edge');
    assert.ok(Math.abs(left('v3') - left('v1')) < 1e-6, 'v3 on the anchor\'s left edge');
    assert.equal(vp('v2').y, before.v2.y, 'nothing moves up or down');
    assert.equal(vp('v3').y, before.v3.y);
    act(() => { undoDrafts(); });
    assert.deepEqual(centres(), before, 'ONE undo puts all three back');
  });

  it('the first chosen is the anchor, whichever it is', () => {
    const { ui, pick } = mount();
    const before = centres();
    pick('v3', false);
    pick('v1', true);
    pick('v2', true);
    click(button(ui, 'wall.align.right'));
    assert.deepEqual(centres().v3, before.v3, 'v3 was chosen first and stays');
    assert.ok(Math.abs(right('v1') - right('v3')) < 1e-6 && Math.abs(right('v2') - right('v3')) < 1e-6, 'the others line up on its right edge');
  });

  it('distributes three evenly across: the outer two stay, the gaps are equal; one undo', () => {
    const { ui, pick } = mount();
    const before = centres();
    pick('v1', false);
    pick('v2', true);
    pick('v3', true);
    click(button(ui, 'wall.distribute.across'));
    assert.deepEqual(vp('v1').x, before.v1.x, 'the leftmost stays');
    assert.deepEqual(vp('v3').x, before.v3.x, 'the rightmost stays');
    const first = left('v2') - right('v1');
    const second = left('v3') - right('v2');
    assert.ok(Math.abs(first - second) < 1e-6, `gaps ${first} and ${second}`);
    assert.notEqual(vp('v2').x, before.v2.x, 'the one between moved');
    assert.equal(vp('v2').y, before.v2.y);
    act(() => { undoDrafts(); });
    assert.deepEqual(centres(), before);
  });

  it('is offered in the palette and by the Wall\'s actions only while enough drawings are chosen', () => {
    const { ui, pick } = mount();
    assert.equal(availableWallCommands().includes('wall.align.left'), false);
    pick('v1', false);
    assert.equal(availableWallCommands().includes('wall.align.left'), false, 'one drawing is nothing to line up with');
    pick('v2', true);
    assert.equal(availableWallCommands().includes('wall.align.left'), true);
    assert.equal(availableWallCommands().includes('wall.distribute.across'), false, 'two cannot be spaced');
    assert.ok(buildWallCommands([]).some((c) => c.id === 'wall:wall.align.left'), 'a palette row');
    const before = centres();
    assert.equal(runWallCommand('wall.align.centreH'), true);
    assert.equal(vp('v2').y, before.v1.y, 'v2 on the horizontal centre line of v1');
    assert.equal(vp('v1').y, before.v1.y);
    pick('v3', true);
    assert.equal(runWallCommand('wall.distribute.down'), true);
    assert.equal(showsCard(ui), true);
  });
});
