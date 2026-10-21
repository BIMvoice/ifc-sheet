/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AutoCAD mode (#168) on the sheet tab (`SheetView`): its command line takes
 * typed aliases like the stepped-in sheet's. ORTHO is the probe: it needs no
 * Wall handler, and a plain command line does not know it.
 */
import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { SheetView } from './SheetView.js';

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

function mount(): HTMLInputElement {
  const ui = render(<SheetView sheet={useProjectStore.getState().sheets[1]} />);
  return ui.querySelector('input[aria-label="Command line"]') as HTMLInputElement;
}

function enter(line: HTMLInputElement, text: string): void {
  for (const ch of text) press(document.body, ch);
  press(line, 'Enter');
}

beforeEach(() => {
  setPlatform('Win32');
  resetProject();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
  localStorage.clear();
  setPlatform(null);
});

describe('SheetView with AutoCAD mode on', () => {
  beforeEach(() => setAutocadMode(true));

  it('ortho typed in the command line works', () => {
    const line = mount();
    enter(line, 'ortho');
    assert.equal(useDraftingSession.getState().ortho, true);
  });

  it('Enter with focus away from the line repeats the last alias', () => {
    const line = mount();
    enter(line, 'ortho');
    act(() => line.blur());
    press(document.body, 'Enter');
    assert.equal(useDraftingSession.getState().ortho, false);
  });
});

describe('SheetView with AutoCAD mode off', () => {
  it('ORTHO is not a command', () => {
    const line = mount();
    enter(line, 'ortho');
    assert.equal(useDraftingSession.getState().ortho, false);
  });
});
