/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, render } from '@/test/render.js';
import { setPlatform } from '@/test/platform.js';
import { resolveEnglish as t } from '@/i18n/registry';
import { cancelCommand, useDraftingSession } from '@/drafting/session';
import { setAutocadMode } from '@/lib/commands/autocad-mode';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { SteppedSheet } from './SteppedSheet.js';

/** AutoCAD mode (#168) on a real sheet stepped into: the command line is there to type into, and aliases run the sheet's actions. */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const commandLine = (ui: HTMLElement) => ui.querySelector<HTMLInputElement>(`input[aria-label="${t('drafting.commandLine')}"]`);

function sheet(): HTMLElement {
  return render(<SteppedSheet sheet={useProjectStore.getState().sheets[1]} extent={HOUSE} proposals={[]} onBack={() => {}} onStep={() => {}} />);
}

function enter(ui: HTMLElement, text: string): void {
  for (const ch of text) press(document.body, ch);
  press(commandLine(ui)!, 'Enter');
}

beforeEach(() => {
  setPlatform('Win32');
  resetProject();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  useDraftingSession.setState({ history: [], lastCommandId: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setAutocadMode(false);
  localStorage.clear();
  setPlatform(null);
});

describe('AutoCAD mode on a sheet', () => {
  it('off (the default): the idle sheet shows no command line, as today', () => {
    const ui = sheet();
    assert.equal(commandLine(ui), null);
  });

  it('on: the command line shows on the idle sheet', () => {
    setAutocadMode(true);
    const ui = sheet();
    assert.ok(commandLine(ui));
  });

  it('PAGESETUP opens the paper settings, as the Paper button does', () => {
    setAutocadMode(true);
    const ui = sheet();
    const paper = () => [...ui.querySelectorAll('button')].find((b) => b.textContent?.trim() === t('wall.paper.button'));
    assert.equal(paper()?.getAttribute('aria-pressed'), 'false');
    enter(ui, 'pagesetup');
    assert.equal(paper()?.getAttribute('aria-pressed'), 'true');
    assert.equal(useDraftingSession.getState().history.at(-1)?.key, 'wall.paper.button');
  });

  it('L starts a line on the sheet, and Enter on the empty line repeats it', () => {
    setAutocadMode(true);
    const ui = sheet();
    enter(ui, 'l');
    assert.equal(useDraftingSession.getState().commandId, 'line');
    press(commandLine(ui)!, 'Escape');
    assert.equal(useDraftingSession.getState().commandId, null);
    press(commandLine(ui)!, 'Enter');
    assert.equal(useDraftingSession.getState().commandId, 'line');
  });
});
