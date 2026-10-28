/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, render, type } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel, ProjectSheet } from '@/project/types';
import { SheetPaper } from '../sheets/SheetPaper';
import { ProjectDrawer } from './ProjectDrawer.js';
import { TitleBlockCard } from './TitleBlockForm.js';
import { useWallNav } from './wall-nav.js';

/**
 * The title block on the Wall: filled once in the project drawer, it prints
 * on every sheet; a sheet's own card changes it on that sheet only, and puts
 * it back to the project's value.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, panel: 'drawer' });
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

/** The texts the sheet's paper prints, ` | `-separated (its viewports left out: only the title block matters here). */
function printed(sheet: ProjectSheet): string {
  const ui = render(
    <SheetPaper sheet={{ ...sheet, viewports: [] }} projectName={useProjectStore.getState().name} content={() => ({ view: undefined, drawing: null, drafts: [] })}
      layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />,
  );
  return [...ui.querySelectorAll('text')].map((t) => t.textContent).join(' | ');
}

function input(ui: HTMLElement, label: string): HTMLInputElement {
  const found = [...ui.querySelectorAll('label')].find((l) => l.firstElementChild?.textContent?.startsWith(label))?.querySelector('input');
  assert.ok(found, `a field ${label}`);
  return found;
}

function fill(el: HTMLInputElement, value: string): void {
  type(el, value);
  blur(el);
}

describe('Title block on the Wall', () => {
  it('a client typed once in the project drawer prints on every sheet', () => {
    const ui = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    fill(input(ui, 'Client'), 'Cluj County');
    const sheets = useProjectStore.getState().sheets;
    assert.ok(sheets.length >= 2);
    for (const s of sheets) assert.match(printed(s), /Cluj County/, `${s.number} prints the client`);
  });

  it('a sheet says otherwise for one field, and goes back to the project\'s value', () => {
    const drawer = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    fill(input(drawer, 'Drawn by'), 'IC');
    const [a, b] = useProjectStore.getState().sheets;

    const card = render(<TitleBlockCard sheet={a} onClose={() => {}} />);
    fill(input(card, 'Drawn by'), 'PC');
    const now = () => useProjectStore.getState().sheets;
    assert.match(printed(now()[0]), /PC/);
    assert.doesNotMatch(printed(now()[0]), /\bIC\b/);
    assert.match(printed(now().find((s) => s.id === b.id)!), /\bIC\b/);

    cleanup();
    const again = render(<TitleBlockCard sheet={now()[0]} onClose={() => {}} />);
    const back = [...again.querySelectorAll('button')].find((x) => x.textContent === 'As on every sheet');
    assert.ok(back, 'the own field offers the project\'s value back');
    click(back);
    assert.match(printed(now()[0]), /\bIC\b/);
  });

  it('a field left as it is on a sheet stays the project\'s', () => {
    const [a] = useProjectStore.getState().sheets;
    const card = render(<TitleBlockCard sheet={a} onClose={() => {}} />);
    blur(input(card, 'Date'));
    assert.equal(useProjectStore.getState().sheets[0].titleBlock, undefined);
  });
});
