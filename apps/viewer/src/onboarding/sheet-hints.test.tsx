/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hints inside a sheet (#455), on the drawing set the app makes for a model: the first time a feature applies
 * the hint is there, in a line or section tool it names the ortho state and its key, and a dismissal is for good.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, click, render } from '@/test/render.js';
import { cancelCommand, startDraftCommand, toggleOrtho, useDraftingSession } from '@/drafting/session';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { SteppedSheet } from '@/components/viewer/wall/SteppedSheet';
import { forgetHintStateForTests, HINTS_STORAGE_KEY } from './hints.js';
import { SheetHints } from './SheetHints.js';

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

const hint = (ui: HTMLElement, id: string): HTMLElement | null => ui.querySelector<HTMLElement>(`[data-hint="${id}"]`);

function stepIn(): HTMLElement {
  const { sheets, views } = useProjectStore.getState();
  const plan = views.find((v) => v.kind === 'plan');
  const sheet = sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === plan?.id));
  assert.ok(sheet);
  return render(<SteppedSheet sheet={sheet} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} />);
}

beforeEach(() => {
  window.localStorage.removeItem(HINTS_STORAGE_KEY);
  forgetHintStateForTests();
  resetProject();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ selection: new Set(), ortho: false, orthoHeld: false });
});
afterEach(() => {
  act(() => cancelCommand());
  cleanup();
  window.localStorage.removeItem(HINTS_STORAGE_KEY);
  forgetHintStateForTests();
});

describe('hints in a sheet', () => {
  it('a new user stepping into a sheet is told that a double-click draws in a drawing', () => {
    const ui = stepIn();
    assert.match(hint(ui, 'openView')?.textContent ?? '', /Double-click a drawing/);
  });

  it('a chosen drawing with grips is told its edges resize it, first', () => {
    const ui = render(<div className="relative"><SheetHints resizing hasDrawings /></div>);
    assert.match(hint(ui, 'viewportResize')?.textContent ?? '', /edge or a corner.*resize/);
    assert.equal(hint(ui, 'openView'), null, 'one hint at a time');
  });

  it('in the line tool, the ortho state and its key are said, and follow the toggle', () => {
    const ui = stepIn();
    const line = [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Line');
    assert.ok(line, 'the rail offers Line');
    click(line);
    assert.match(hint(ui, 'ortho')?.textContent ?? '', /Ortho is off.*F8/);
    act(() => toggleOrtho());
    assert.match(hint(ui, 'ortho')?.textContent ?? '', /Ortho is on.*F8/);
    assert.equal(hint(ui, 'openView'), null, 'the tool hint takes the place of the other');
  });

  it('in the section line tool too', () => {
    const ui = stepIn();
    act(() => { startDraftCommand('sectionline'); });
    assert.ok(hint(ui, 'ortho'));
  });

  it('a dismissed hint is not shown the next time the sheet opens, even after a reload', () => {
    const first = stepIn();
    click(first.querySelector<HTMLButtonElement>('[data-hint="openView"] button')!);
    assert.equal(hint(first, 'openView'), null);
    cleanup();
    forgetHintStateForTests();
    const second = stepIn();
    assert.equal(hint(second, 'openView'), null);
  });
});
