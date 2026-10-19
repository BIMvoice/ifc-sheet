/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { addProjectSheet, addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { saveAxonometricView } from '@/project/open-view';
import { ViewportCard } from './ViewportCard.js';

/**
 * Issue #49: a 3D view is placeable like any other (the card used to leave
 * them out), and its card offers how it prints instead of a cut or a depth.
 */

beforeEach(() => resetProject());
afterEach(() => cleanup());

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

const sheet = () => useProjectStore.getState().sheets[0];
const view = () => useProjectStore.getState().views[0];

describe('3D views on the Wall', () => {
  it('are offered for placing, and land with their scale or their image box', () => {
    saveAxonometricView('Axo');
    addProjectView({ kind: '3d', name: 'Perspective', viewpoint: null, projection: 'perspective' });
    addProjectSheet('Presentation');
    const placed: string[] = [];
    const ui = render(<ViewportCard sheet={sheet()} slot={null} onOpen={() => {}} onChoose={(id) => id && placed.push(id)} />);
    const pick = ui.querySelector('select')!;
    assert.deepEqual([...pick.querySelectorAll('option')].map((o) => o.textContent), ['Choose a drawing or schedule…', 'Axo', 'Perspective']);

    choose(pick, useProjectStore.getState().views[0].id);
    choose(pick, useProjectStore.getState().views[1].id);
    const [axo, persp] = sheet().viewports!;
    assert.equal(placed.length, 2);
    assert.deepEqual([axo.scale, axo.width, axo.height], [200, 0, 0], 'an axonometric keeps its scale and fits its drawing');
    assert.deepEqual([persp.width, persp.height], [150, 100], 'a perspective takes an image box');
  });

  it('shows an axonometric its scale and corner, and a perspective its capture instead of a scale', () => {
    saveAxonometricView('Axo');
    addProjectSheet('Presentation');
    addViewport(sheet().id, view().id, { x: 100, y: 100 }, 200);
    let ui = render(<ViewportCard sheet={sheet()} slot={sheet().viewports![0]} onOpen={() => {}} onChoose={() => {}} />);
    const text = () => ui.textContent ?? '';
    assert.match(text(), /Scale/);
    assert.match(text(), /South-east/);
    assert.doesNotMatch(text(), /Capture the 3D view/);

    const selects = [...ui.querySelectorAll('select')];
    choose(selects.find((s) => [...s.options].some((o) => o.value === 'perspective'))!, 'perspective');
    assert.equal((view() as { projection?: string }).projection, 'perspective');
    cleanup();
    ui = render(<ViewportCard sheet={sheet()} slot={sheet().viewports![0]} onOpen={() => {}} onChoose={() => {}} />);
    assert.doesNotMatch(text(), /Scale/, 'a perspective has no scale field');
    assert.match(text(), /Capture the 3D view at 300 dpi/);
    assert.match(text(), /Not captured yet/);
  });
});
