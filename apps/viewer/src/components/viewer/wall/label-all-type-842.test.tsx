/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #842: a label type labels a drawing on a stepped-in sheet. In IfcSheet the Wall is the face and the 3D tab stays the
 * active document tab, so "Draw with it" used to only set the type there. Now "Draw with it" starts the label tool on
 * the drawing in front, and "Label all" runs LABELALL with the type on it (or on the drawing chosen on the sheet, opened
 * for it): one label per element of the class picked, with the signs of `signs-with-pset.ifc` as that view's elements.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { cancelCommand, runningCommand, setViewElementsProvider, submitCommandLine, useDraftingSession } from '@/drafting/session';
import { clearDraftHistory } from '@/drafting/draft-store';
import { MODEL_TAB_ID, useDocumentTabs } from '@/project/document-tabs';
import { resetProject, useProjectStore } from '@/project/project-store';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { defaultViews } from '@/project/view-defaults';
import { paperOf } from '@/project/sheets';
import { fitWidth } from './sheet-fit.js';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectSheet, ProjectView } from '@/project/types';
import type { AnnotationType } from '@/catalogue/types';
import { AnnotationTypesTab } from '../drafting/standards/AnnotationTypesTab.js';
import { SteppedSheet } from './SteppedSheet.js';

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const SIGN_TYPE: AnnotationType = { id: 'at-sign', name: 'Sign code', tool: 'label', label: { template: '{Tag}', missing: 'question' } };
/** The two IfcSign of the fixture (#120, #121) as the plan draws them: a point to label each at and its outline. */
const SIGNS = [120, 121].map((renderId, i) => ({ renderId, anchor: { x: 2 + i * 4, y: 3 }, ring: [{ x: 1.9 + i * 4, y: 2.9 }, { x: 2.1 + i * 4, y: 2.9 }, { x: 2.1 + i * 4, y: 3.1 }, { x: 1.9 + i * 4, y: 3.1 }] }));
let guids: string[] = [];
let plan: ProjectView;
let sheet: ProjectSheet;

beforeEach(async () => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  const store = await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/signs-with-pset.ifc')));
  seedModel('signs', 0, store, 120);
  guids = [store.entities.getGlobalId(120), store.entities.getGlobalId(121)];
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useProjectStore.setState({ annotationTypes: [SIGN_TYPE] });
  // IfcSheet's face is the Wall: no drawing tab is in front.
  useDocumentTabs.setState({ openIds: [], activeId: MODEL_TAB_ID });
  const found = useProjectStore.getState().views.find((v) => v.kind === 'plan');
  const on = useProjectStore.getState().sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === found?.id));
  assert.ok(found && on, 'the drawing set hangs a plan on a sheet');
  plan = found;
  sheet = on;
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
  setViewElementsProvider(null);
});

const button = (ui: HTMLElement, label: string) => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const labels = () => useProjectStore.getState().drafts.filter((d) => d.viewId === plan.id && d.params.atype === SIGN_TYPE.id);

function mount(focus: string | null): HTMLElement {
  return render(
    <>
      <SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} initialFocus={focus} onBack={() => {}} onStep={() => {}} />
      <AnnotationTypesTab />
    </>,
  );
}

describe('a label type on a drawing of a sheet (#842)', () => {
  it('Label all labels every sign of the drawing in front, with the type picked, in one action', () => {
    const ui = mount(plan.id);
    assert.equal(useDraftingSession.getState().viewId, plan.id, 'the plan is the drawing in front');
    // The plan's drawing is made by the viewer's worker; its elements are what the drawing would give the session.
    setViewElementsProvider(() => SIGNS);
    const labelAll = button(ui, 'Label all');
    assert.ok(labelAll, 'a label type offers Label all beside Draw with it');
    act(() => click(labelAll));
    assert.equal(useDraftingSession.getState().commandId, 'labelall', 'LABELALL runs on the drawing');
    assert.deepEqual(useDraftingSession.getState().prompt?.choices?.map((c) => c.value), ['IfcSign'], 'it offers the class the drawing shows');
    act(() => submitCommandLine('IfcSign', null));
    assert.deepEqual(labels().map((d) => String(d.params.labelOf)).sort(), [...guids].sort(), 'one label of the type on each sign');
    assert.equal(runningCommand(), null, 'and it is done');
  });

  it('Draw with it starts the label tool on the drawing in front, not only the type', () => {
    const ui = mount(plan.id);
    act(() => click(button(ui, 'Draw with it')!));
    assert.equal(useDraftingSession.getState().commandId, 'label');
    assert.equal(useDraftingSession.getState().viewId, plan.id);
  });

  it('Label all with no drawing in front opens the drawing chosen on the sheet and runs LABELALL on it', () => {
    const ui = mount(null);
    // A press on the plan chooses it (the canvas fits the whole sheet on arrival: the same arithmetic finds the plan on screen).
    const canvas = ui.querySelector<HTMLElement>('[data-sheet-canvas]');
    assert.ok(canvas);
    const paper = paperOf(sheet);
    const slot = (sheet.viewports ?? []).find((vp) => vp.viewId === plan.id)!;
    const width = fitWidth(canvas);
    const k = Math.min((width - 24) / paper.w, (canvas.getBoundingClientRect().height - 24) / paper.h);
    const at = { clientX: (width - paper.w * k) / 2 + slot.x * k, clientY: (canvas.getBoundingClientRect().height - paper.h * k) / 2 + slot.y * k };
    for (const type of ['pointerdown', 'pointerup']) act(() => { canvas.dispatchEvent(new window.PointerEvent(type, { ...at, bubbles: true, button: 0, pointerId: 1 })); });
    act(() => click(button(ui, 'Label all')!));
    assert.equal(useDraftingSession.getState().viewId, plan.id, 'the chosen drawing came forward');
    assert.equal(useDraftingSession.getState().commandId, 'labelall');
  });

  it('with neither a drawing in front nor one chosen, nothing starts on the paper', () => {
    const ui = mount(null);
    act(() => click(button(ui, 'Label all')!));
    assert.equal(runningCommand(), null);
    assert.equal(labels().length, 0);
  });
});
