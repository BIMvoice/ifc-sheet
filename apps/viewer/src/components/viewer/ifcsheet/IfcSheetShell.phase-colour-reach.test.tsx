/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #652, on AC20-FZK-Haus, through IfcSheet's face (`IfcSheetShell`), where the engine's navigator and ribbon are covered: a plan
 * chosen on a sheet offers "Colour by property" (with the legend added to the sheet) and "Phases" (draw the view by phase, start from
 * a demolition plan), both written to the project and not to the model.
 */
import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { resetProject, useProjectStore } from '@/project/project-store';
import { planViewFor } from '@/project/view-defaults';
import { useViewDrawings } from '@/project/view-drawings';
import { paperOf } from '@/project/sheets';
import { clearDraftHistory } from '@/drafting/draft-store';
import { cancelCommand } from '@/drafting/session';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { IfcSheetShell } from './IfcSheetShell.js';
import { stepInto, useWallNav } from '../wall/wall-nav.js';

const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const labelled = (root: ParentNode, text: string): HTMLElement => {
  const found = [...root.querySelectorAll<HTMLElement>('button, [role="button"]')].find((b) => [text, `▸${text}`].some((s) => b.textContent?.trim().startsWith(s)));
  assert.ok(found, `a control "${text}" (buttons: ${[...root.querySelectorAll('button')].map((b) => b.textContent?.trim()).join(' | ')})`);
  return found;
};

afterEach(() => {
  cleanup();
  cancelCommand();
  publishDrawingRuntime(null);
  useViewDrawings.setState({ byView: {} });
  useViewerStore.setState({ models: new Map() } as never);
});

/** A pointer event on the sheet canvas at the centre of the viewport that shows `viewId` (the canvas fits the whole sheet on arrival). */
function clickViewport(ui: HTMLElement, sheet: ProjectSheet, viewId: string): void {
  const paper = paperOf(sheet);
  const vp = (sheet.viewports ?? []).find((v) => v.viewId === viewId)!;
  const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
  assert.ok(canvas, 'the sheet is in front');
  const { width, height } = canvas.getBoundingClientRect();
  const k = Math.min((width - 24) / paper.w, (height - 24) / paper.h);
  const at = { clientX: (width - paper.w * k) / 2 + vp.x * k, clientY: (height - paper.h * k) / 2 + vp.y * k };
  for (const type of ['pointerdown', 'pointerup']) act(() => { canvas.dispatchEvent(new window.PointerEvent(type, { ...at, bubbles: true, button: 0, pointerId: 1 })); });
}

/** The house's ground plan, drawn, on a sheet of its own and chosen there; null (the test is skipped) when the model or wasm runtime is missing. */
async function choosePlan(t: TestContext): Promise<{ ui: HTMLElement; viewId: string } | null> {
  if (planModelMissing(FZK_HAUS)) { t.skip(`${FZK_HAUS} is missing: run pnpm fixtures`); return null; }
  resetProject();
  clearDraftHistory();
  const m = await loadPlanModel(FZK_HAUS);
  const level = m.levels.find((l) => l.name === 'Erdgeschoss')!;
  const plan = { ...planViewFor(level, []), createdAt: 0 } as ProjectView;
  const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [{ id: 'vp', viewId: plan.id, x: 250, y: 200, scale: 100, width: 0, height: 0, center: null }] };
  useProjectStore.setState({ views: [plan], sheets: [sheet], drafts: [] });
  useViewDrawings.setState({ byView: { [plan.id]: { drawing: await m.planOf(plan), status: 'ready', progress: 100, phase: '', error: null } } });
  publishDrawingRuntime({ geometryResult: useViewerStore.getState().models.get('m')!.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
  const ui = render(<IfcSheetShell />);
  act(() => stepInto(sheet.id));
  await wait();
  clickViewport(ui, sheet, plan.id);
  await wait();
  return { ui, viewId: plan.id };
}

const viewOf = (id: string) => useProjectStore.getState().views.find((v) => v.id === id)!;

describe('colour by property and phases in the IfcSheet face (#652)', () => {
  it('colours the chosen plan by a property and puts its legend on the sheet', async (t) => {
    const made = await choosePlan(t);
    if (!made) return;
    const { ui, viewId } = made;
    click(labelled(ui, 'Colour by property'));
    click(labelled(ui, 'Colour this view by a property'));
    assert.ok(viewOf(viewId).graphics?.colourScheme, 'the plan has a scheme');
    assert.ok(ui.querySelector('input[type="color"][aria-label="Colour of Bad"]'), 'the rooms are listed with a colour each');
    click(labelled(ui, 'Add legend'));
    assert.equal(useProjectStore.getState().legends?.length, 1, 'the legend is made');
    assert.ok([...ui.querySelectorAll('button')].some((b) => b.textContent === 'The legend is on this sheet'), 'and hung on this sheet');
  });

  it('draws the chosen plan by phase, from a demolition preset, in the project and not the model', async (t) => {
    const made = await choosePlan(t);
    if (!made) return;
    const { ui, viewId } = made;
    click(labelled(ui, 'Phases'));
    assert.equal(viewOf(viewId).graphics?.phases, undefined, 'not by phase until asked');
    click(ui.querySelector<HTMLElement>('[data-phase-card] [aria-label="Draw by phase"]')!);
    assert.deepEqual(viewOf(viewId).graphics?.phases?.show, ['existing', 'demolish', 'new', 'temporary']);
    const preset = ui.querySelector<HTMLSelectElement>('[data-phase-card] select[aria-label="Start from"]')!;
    act(() => { preset.value = 'demolition'; preset.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.deepEqual(viewOf(viewId).graphics?.phases?.show, ['existing', 'demolish']);
    assert.equal(useViewerStore.getState().mutationViews.size, 0, 'the model was not edited');
  });
});
