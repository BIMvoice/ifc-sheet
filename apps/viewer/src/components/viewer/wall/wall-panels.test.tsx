/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall's right-hand panels (#296): one at a time, in one place; Esc closes the one in front and hands focus back
 * to the control that opened it, after a running tool and the selection have had their Esc. And the face's Tab order
 * (#295): the top bar, the sheet toolbar, the tools, the card.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, click, press, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { attachDraftingView, cancelCommand, pressEscape, runningCommand, setDraftSelection, startDraftCommand } from '@/drafting/session';
import { IfcSheetShell } from '../ifcsheet/IfcSheetShell.js';
import { stepInto, useWallNav } from './wall-nav.js';

const MODEL = { id: 'm', name: 'm.ifc', ifcDataStore: null, geometryResult: null, visible: true, collapsed: false, schemaVersion: 'IFC4', loadedAt: 1, fileSize: 3, idOffset: 0, maxExpressId: 0 };

beforeEach(() => {
  resetProject();
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } });
  useViewerStore.setState({ models: new Map([['m', MODEL as never]]) });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null });
});
afterEach(() => {
  cleanup();
  cancelCommand();
  setDraftSelection(new Set());
  attachDraftingView(null, 'down', () => []);
  useViewerStore.setState({ models: new Map() });
});

const bar = (ui: HTMLElement, name: string): HTMLButtonElement => {
  const b = [...ui.querySelectorAll('header button')].find((x) => x.textContent?.trim() === name);
  assert.ok(b, `top bar button ${name}`);
  return b as HTMLButtonElement;
};
const panels = (): string[] => [...document.querySelectorAll('aside[aria-label]')].map((a) => a.getAttribute('aria-label') ?? '');
const open = async (ui: HTMLElement, name: string): Promise<void> => {
  bar(ui, name).focus();
  click(bar(ui, name));
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};
const NAMES = ['What changed', 'What is missing', 'Issue the set', 'Project'] as const;

describe('the Wall panels share one place (#296)', () => {
  it('opening any one closes the others, whichever order they are opened in', async () => {
    const ui = render(<IfcSheetShell />);
    for (const first of NAMES) {
      for (const second of NAMES) {
        if (first === second) continue;
        await open(ui, first);
        await open(ui, second);
        assert.ok(panels().length <= 1, `${first} then ${second}: ${panels().join(', ')} are open together`);
        assert.notEqual(useWallNav.getState().panel, null, `${first} then ${second}: the second is the one open`);
        click(bar(ui, second));
      }
    }
  });

  it('opens What changed over What is missing and leaves one panel', async () => {
    const ui = render(<IfcSheetShell />);
    await open(ui, 'What is missing');
    assert.deepEqual(panels(), ['What is missing']);
    await open(ui, 'What changed');
    assert.deepEqual(panels(), ['What changed']);
    await open(ui, 'Project');
    assert.equal(useWallNav.getState().panel, 'drawer');
    assert.deepEqual(panels(), ['Project']);
  });
});

describe('Esc closes the panel in front (#296)', () => {
  for (const name of NAMES) {
    it(`closes ${name} and returns focus to its button`, async () => {
      const ui = render(<IfcSheetShell />);
      await open(ui, name);
      assert.notEqual(useWallNav.getState().panel, null);
      press(window, 'Escape');
      assert.equal(useWallNav.getState().panel, null);
      assert.equal(document.activeElement, bar(ui, name));
    });
  }

  it('closes only the one in front when two were opened in turn', async () => {
    const ui = render(<IfcSheetShell />);
    await open(ui, 'What is missing');
    await open(ui, 'What changed');
    press(window, 'Escape');
    assert.deepEqual(panels(), []);
    assert.equal(document.activeElement, bar(ui, 'What changed'));
  });

  it('lets a running tool have its Esc first, then the selection, then closes the panel', async () => {
    const ui = render(<IfcSheetShell />);
    act(() => { attachDraftingView('view-1', 'down', () => []); });
    act(() => { startDraftCommand('line'); });
    assert.ok(runningCommand(), 'a tool is running');
    await open(ui, 'What is missing');
    press(window, 'Escape');
    assert.equal(useWallNav.getState().panel, 'missing', 'the tool has this Esc, the panel stays');
    act(() => { pressEscape(); }); // what the drafting keys do on that same press
    assert.equal(runningCommand(), null);
    act(() => { setDraftSelection(new Set(['e1'])); });
    press(window, 'Escape');
    assert.equal(useWallNav.getState().panel, 'missing', 'the selection has this Esc, the panel stays');
    act(() => { pressEscape(); });
    press(window, 'Escape');
    assert.equal(useWallNav.getState().panel, null);
  });

  it('leaves Esc to a modal that is open', async () => {
    const ui = render(<IfcSheetShell />);
    await open(ui, 'What is missing');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    try {
      press(window, 'Escape');
      assert.equal(useWallNav.getState().panel, 'missing');
    } finally {
      dialog.remove();
    }
  });
});

describe('Tab order on the face (#295)', () => {
  it('runs top bar, sheet toolbar, tools, card, with no positive tabindex', () => {
    const ui = render(<IfcSheetShell />);
    act(() => { stepInto(useProjectStore.getState().sheets[0].id); });
    const stops = [...ui.querySelectorAll<HTMLElement>('button, select, input, textarea, a[href], [tabindex]')]
      .filter((e) => !e.closest('[inert]') && e.getAttribute('tabindex') !== '-1' && !(e as HTMLButtonElement).disabled && e.getAttribute('type') !== 'file');
    assert.ok(stops.every((e) => Number(e.getAttribute('tabindex') ?? 0) <= 0), 'no positive tabindex');
    const at = (match: (e: HTMLElement) => boolean, what: string): number => {
      const i = stops.findIndex(match);
      assert.ok(i >= 0, `the stop ${what} is missing from ${stops.map((e) => e.textContent?.trim()).join(' | ')}`);
      return i;
    };
    const label = (text: string) => (e: HTMLElement) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(text);
    const order = [
      at((e) => e.closest('header') !== null && label('Project')(e), 'Project'),
      at((e) => e.closest('header') !== null && label('Feedback')(e), 'Feedback'),
      at(label('Wall'), 'Wall'),
      at(label('Comment'), 'Comment'),
      at(label('Dimension'), 'Dimension'),
      at((e) => e instanceof HTMLSelectElement, 'card select'),
    ];
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `regions out of order: ${order.join(',')}`);
  });
});
