/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * AutoCAD mode (#168) in the real drafting view: its typed line and its
 * empty-line confirm both go through `submitTypedLine`, not the session's
 * `submitCommandLine`. ORTHO is the probe: it is an alias that needs no Wall
 * handler, and a plain command line does not know it.
 */
import '@/test/setup-dom.js';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import type { ProjectView } from '@/project/types';
import { DraftingView } from './DraftingView.js';

const plan = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 } satisfies ProjectView;

function mount(): HTMLInputElement {
  const ui = render(<DraftingView view={plan} />);
  return ui.querySelector('input[aria-label="Command line"]') as HTMLInputElement;
}

function enter(line: HTMLInputElement, text: string): void {
  for (const ch of text) press(document.body, ch);
  press(line, 'Enter');
}

beforeEach(() => {
  setPlatform('Win32');
  cancelCommand();
  resetProject();
  useProjectStore.setState({ views: [plan] });
  useDraftingSession.setState({ selection: new Set(), ortho: false, snap: true, history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
  localStorage.clear();
  setPlatform(null);
});

describe('DraftingView with AutoCAD mode on', () => {
  beforeEach(() => setAutocadMode(true));

  it('a typed alias runs its action (the text submit is submitTypedLine)', () => {
    const line = mount();
    enter(line, 'ortho');
    assert.equal(useDraftingSession.getState().ortho, true);
  });

  it('Enter with focus away from the line repeats the last alias (the empty submit is submitTypedLine)', () => {
    const line = mount();
    enter(line, 'ortho');
    act(() => line.blur());
    press(document.body, 'Enter');
    assert.equal(useDraftingSession.getState().ortho, false);
  });

  it('Enter in the empty line repeats the last alias too', () => {
    const line = mount();
    enter(line, 'ortho');
    press(line, 'Enter');
    assert.equal(useDraftingSession.getState().ortho, false);
  });
});

describe('DraftingView with AutoCAD mode off', () => {
  it('ORTHO is not a command, and Enter repeats nothing', () => {
    const line = mount();
    enter(line, 'ortho');
    assert.equal(useDraftingSession.getState().ortho, false);
    act(() => line.blur());
    press(document.body, 'Enter');
    assert.equal(useDraftingSession.getState().ortho, false);
  });
});
