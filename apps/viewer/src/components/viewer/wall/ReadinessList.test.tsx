/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { resetProject } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { parseStep } from '@/test/properties-panel-harness.js';
import type { ModelExtent } from '@/project/drawing-set';
import { ProjectDrawer } from './ProjectDrawer.js';
import { WallIntro } from './WallIntro.js';
import { useWallNav } from './wall-nav.js';

/** What the model lacks shows on the intro (the lines) and in the project drawer (the lines and the features they weaken). */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, drawer: true });
});
afterEach(() => {
  cleanup();
  useViewerStore.setState({ models: new Map() } as never);
});

async function openSample(): Promise<void> {
  const ifcDataStore = await parseStep(new Uint8Array(readFileSync(new URL('../../../../public/samples/building-architecture.ifc', import.meta.url))));
  useViewerStore.setState({ models: new Map([['m', { ifcDataStore, name: 'building-architecture.ifc' }]]) } as never);
}

/** Open the drawer's "What the model lacks" section the way a user does, by its summary. */
function openReadiness(root: HTMLElement): void {
  const summary = [...root.querySelectorAll('summary')].find((el) => el.textContent === 'What the model lacks');
  assert.ok(summary, 'the drawer has a What the model lacks section');
  click(summary);
}

describe('what the model lacks', () => {
  it('is said on the intro, without the effects', async () => {
    await openSample();
    const text = render(<WallIntro modelName="building-architecture.ifc" extent={HOUSE} onHang={() => {}} />).textContent ?? '';
    assert.match(text, /5 of 11 elements are on no storey\./);
    assert.match(text, /4 of 11 elements have no quantity set/);
    assert.doesNotMatch(text, /material takeoff/);
  });

  it('is said in the project drawer with the feature each gap weakens', async () => {
    await openSample();
    const root = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    openReadiness(root);
    const text = root.textContent ?? '';
    assert.match(text, /What the model lacks/);
    assert.match(text, /5 of 11 elements are on no storey\./);
    assert.match(text, /The joinery schedule shows a dash/);
    assert.match(text, /The material takeoff has no volume or area for them/);
    assert.doesNotMatch(text, /have no material/);
  });

  it('is silent while no model is open', () => {
    const root = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    openReadiness(root);
    assert.doesNotMatch(root.textContent ?? '', /elements have no|has what the drawing set reads/);
  });

  // Review of #105: the list was read once at mount, so a model opened after the drawer never showed.
  it('is read again when a model opens while the drawer is showing it', async () => {
    const root = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />);
    openReadiness(root);
    assert.doesNotMatch(root.textContent ?? '', /elements are on no storey/);
    await act(async () => { await openSample(); });
    assert.match(root.textContent ?? '', /5 of 11 elements are on no storey\./);
  });

  // Review of #105: the facts walk every entity, so a collapsed section does not read them.
  it('is not read while its drawer section is collapsed', async () => {
    await openSample();
    const text = render(<ProjectDrawer extent={HOUSE} onClose={() => {}} />).textContent ?? '';
    assert.match(text, /What the model lacks/);
    assert.doesNotMatch(text, /elements are on no storey/);
  });
});
