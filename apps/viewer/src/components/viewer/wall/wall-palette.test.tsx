/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '0.0.0-test';
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, press, type as typeInto } from '@/test/render.js';
import { renderViewerLayout } from '@/test/viewer-layout-harness.js';
import { setPlatform } from '@/test/platform.js';
import { foldText } from '@/lib/text-fold';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import type { ProjectSheet } from '@/project/types';
import { buildWallCommands } from '../commandPaletteCommandsWall.js';
import { rankCommand } from '../commandPaletteSearch.js';
import { stepInto, useWallNav } from './wall-nav.js';

/**
 * The palette on IfcSheet's face (#99): Ctrl/Cmd+K opens the one palette, a
 * sheet is found by its number or its name with or without accents, and
 * Enter steps into it. "?" opens the list of keys.
 */

const sheet = (id: string, number: string, name: string): ProjectSheet => ({ id, number, name, createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [] });
const SHEETS = [sheet('s1', 'A-101', 'Planuri'), sheet('s2', 'A-201', 'Fațade'), sheet('s3', 'A-301', 'Secțiune')];

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ sheets: SHEETS });
  useViewerStore.setState({ isMobile: false, leftPanelCollapsed: true, rightPanelCollapsed: true, models: new Map() });
  stepInto(null);
});
afterEach(() => {
  cleanup();
  setPlatform(null);
  stepInto(null);
});

const rows = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];
const sheetRows = () => rows().filter((r) => r.getAttribute('data-runtime-source') === 'sheet').map((r) => r.textContent ?? '');
const searchBox = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Search commands"], [role="dialog"] input');

describe('folding text for a match', () => {
  it('drops accents and case, and maps letters that do not decompose', () => {
    assert.equal(foldText('Secțiune'), 'sectiune');
    assert.equal(foldText('Secţiune'), 'sectiune');
    assert.equal(foldText('ȘTEFAN'), 'stefan');
    assert.equal(foldText('Fassade Straße'), 'fassade strasse');
    assert.equal(foldText('Łódź Ø'), 'lodz o');
  });
});

describe('the palette and the sheets', () => {
  for (const [platform, ctrlKey, metaKey] of [['Win32', true, false], ['MacIntel', false, true]] as const) {
    it(`opens on ${platform === 'MacIntel' ? 'Cmd' : 'Ctrl'}+K and finds a sheet by its number or by its name without accents`, () => {
      setPlatform(platform);
      renderViewerLayout();
      assert.equal(searchBox(), null, 'closed to begin with');
      press(document.body, 'k', { ctrlKey, metaKey });
      const box = searchBox();
      assert.ok(box, 'the palette is open');

      typeInto(box, 'A-301');
      assert.deepEqual(sheetRows(), ['A-301 Secțiune']);
      typeInto(box, 'sectiune');
      assert.deepEqual(sheetRows(), ['A-301 Secțiune']);
      typeInto(box, 'SECȚIUNE');
      assert.deepEqual(sheetRows(), ['A-301 Secțiune']);
      typeInto(box, 'fatade');
      assert.deepEqual(sheetRows(), ['A-201 Fațade']);
    });
  }

  it('steps into the sheet on Enter', async () => {
    renderViewerLayout();
    press(document.body, 'k', { ctrlKey: true });
    const box = searchBox();
    assert.ok(box);
    typeInto(box, 'sectiune');
    assert.equal(useWallNav.getState().stepped, null);
    press(box, 'Enter');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    assert.equal(useWallNav.getState().stepped, 's3');
  });

  it('lists no sheet when the project has none, and the Wall\'s actions only while a sheet is stepped into', () => {
    assert.deepEqual(buildWallCommands([]).map((c) => c.id), []);
    const opened: string[] = [];
    const found = buildWallCommands(SHEETS, (id) => opened.push(id)).filter((c) => rankCommand(c, 'secțiune', c.label) > 0);
    assert.deepEqual(found.map((c) => c.id), ['sheet:s3']);
    found[0].action();
    assert.deepEqual(opened, ['s3']);
  });
});

describe('the palette rows that show a key', () => {
  it('announce it with aria-keyshortcuts, from the same row as the key shown (#119 review)', () => {
    setPlatform('Win32');
    renderViewerLayout();
    press(document.body, 'k', { ctrlKey: true });
    assert.ok(searchBox(), 'the palette is open');
    const keyed = rows().filter((r) => r.querySelector('kbd'));
    assert.ok(keyed.length > 0, 'some rows show a key');
    for (const r of keyed) assert.ok(r.getAttribute('aria-keyshortcuts'), `${r.textContent} announces ${r.querySelector('kbd')?.textContent}`);
    const palette = keyed.find((r) => r.querySelector('kbd')?.textContent === 'Ctrl+K');
    if (palette) assert.equal(palette.getAttribute('aria-keyshortcuts'), 'Control+K');
  });
});

describe('the list of keys', () => {
  it('opens on "?" and says what the Wall\'s keys do', () => {
    renderViewerLayout();
    press(document.body, '?', { shiftKey: true });
    // The first-run tour (#131) is a dialog too: the list is the dialog that holds the key rows.
    const dialog = [...document.body.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('[data-shortcut-command]'));
    assert.ok(dialog, 'the list is open');
    const ids = [...dialog.querySelectorAll('[data-shortcut-command]')].map((r) => r.getAttribute('data-shortcut-command'));
    assert.ok(ids.includes('wall.tool.tag') && ids.includes('wall.nextSheet') && ids.includes('ui.commandPalette'), ids.join(', '));
  });
});
