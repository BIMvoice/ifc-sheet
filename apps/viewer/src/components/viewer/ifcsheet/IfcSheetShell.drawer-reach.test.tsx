/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #923: a user found the schedules and the title block "down down in the Project menu". IfcSheet's top bar opens
 * each in one click, as the same section the Project drawer shows (the title block with its .dxf/.svg layout
 * import), and the command palette has a row for each.
 */

import '@/test/setup-dom.js';
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '0.0.0-test';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, render } from '@/test/render.js';
import { setEditionForTests } from '@/edition';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { useViewerStore } from '@/store';
import { buildWallCommands } from '../commandPaletteCommandsWall.js';
import { stepInto, useWallNav } from '../wall/wall-nav.js';
import { IfcSheetShell } from './IfcSheetShell.js';

const SHEETS: ProjectSheet[] = [{ id: 's1', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [] }];

beforeEach(() => {
  setEditionForTests('docs');
  resetProject();
  useProjectStore.setState({ sheets: SHEETS });
  useViewerStore.setState({ isMobile: false, models: new Map() });
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: null, review: null });
});
afterEach(() => {
  cleanup();
  stepInto(null);
  useWallNav.setState({ panel: null });
  setEditionForTests(null);
});

const header = (ui: HTMLElement): HTMLElement => ui.querySelector<HTMLElement>('[data-ifcsheet-shell] header')!;
const button = (root: ParentNode, text: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => (b.textContent?.trim() || b.getAttribute('aria-label')) === text);
  assert.ok(found, `a button "${text}" (buttons: ${[...root.querySelectorAll('button')].map((b) => b.textContent?.trim()).join(' | ')})`);
  return found;
};
/** What a person sees and can use in a piece of the page: every control's text or label, in order. */
const controls = (root: Element): string[] => [...root.querySelectorAll('button, input, select, textarea')]
  .map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('aria-label') ?? e.getAttribute('accept') ?? e.textContent?.trim() ?? ''}`);
const panel = (ui: HTMLElement, label: string): HTMLElement | null => ui.querySelector<HTMLElement>(`aside[aria-label="${label}"]`);

/** The drawer's section of that title: the schedules' group, or the title block's collapsible, without its heading. */
function drawerSection(ui: HTMLElement, title: string): Element {
  act(() => click(button(header(ui), 'Project')));
  const drawer = panel(ui, 'Project');
  assert.ok(drawer, 'the Project drawer opens');
  const group = [...drawer.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === title);
  const details = [...drawer.querySelectorAll('details')].find((d) => d.querySelector('summary')?.textContent === title);
  const found = group ?? details;
  assert.ok(found, `the drawer has a "${title}" section`);
  return found;
}

describe('the schedules and the title block, one click from the top bar (#923)', () => {
  it('opens the drawer\'s schedules section from "Schedules" in the top bar, and closes it on a second click', () => {
    const ui = render(<IfcSheetShell />);
    const inDrawer = controls(drawerSection(ui, 'Schedules'));
    act(() => click(button(header(ui), 'Project')));
    assert.equal(panel(ui, 'Project'), null);

    // An icon in the bar, so the bar keeps one row at 1280 px: named for a screen reader and in its tooltip.
    for (const name of ['Schedules', 'Title block']) assert.equal(button(header(ui), name).getAttribute('title'), name);
    act(() => click(button(header(ui), 'Schedules')));
    const opened = panel(ui, 'Schedules');
    assert.ok(opened, 'the Schedules panel opens');
    assert.ok(inDrawer.includes('button:+ Door and window schedule') && inDrawer.includes('button:+ Material takeoff'), `the drawer section has its add buttons (${inDrawer.join(', ')})`);
    // The panel's own close cross comes first; the rest is the drawer's section, control for control.
    assert.deepEqual(controls(opened).slice(1), inDrawer);
    assert.equal(button(header(ui), 'Schedules').getAttribute('aria-pressed'), 'true');

    act(() => click(button(header(ui), 'Schedules')));
    assert.equal(panel(ui, 'Schedules'), null);
  });

  it('opens the drawer\'s title block, with its .dxf/.svg layout import, from "Title block", and what is typed there is the project\'s', () => {
    const ui = render(<IfcSheetShell />);
    const inDrawer = controls(drawerSection(ui, 'Title block'));
    assert.ok(inDrawer.includes('button:Import a DXF or SVG title block') && inDrawer.includes('input:Title block file (DXF or SVG)'), `the drawer's title block has the layout import (${inDrawer.join(', ')})`);

    act(() => click(button(header(ui), 'Title block')));
    assert.equal(panel(ui, 'Project'), null, 'it replaces the drawer: one panel in front');
    const opened = panel(ui, 'Title block');
    assert.ok(opened, 'the Title block panel opens');
    assert.deepEqual(controls(opened).slice(1), inDrawer);

    const first = opened.querySelector<HTMLInputElement>('input[data-owns-keys]');
    assert.ok(first);
    act(() => {
      first.value = 'Typed in the top bar panel';
      blur(first);
    });
    assert.ok(Object.values(useProjectStore.getState().titleBlock ?? {}).includes('Typed in the top bar panel'), 'the project\'s title block took the value');
  });

  it('has a palette row for each, which opens the same panel', () => {
    const ui = render(<IfcSheetShell />);
    const rows = buildWallCommands(SHEETS);
    for (const [id, label] of [['wall-panel:schedules', 'Schedules'], ['wall-panel:title-block', 'Title block']] as const) {
      const row = rows.find((r) => r.id === id);
      assert.ok(row, `a palette row ${id}`);
      assert.equal(row.label, label);
      act(() => row.action());
      assert.ok(panel(ui, label), `the row opens the ${label} panel`);
    }
  });
});
