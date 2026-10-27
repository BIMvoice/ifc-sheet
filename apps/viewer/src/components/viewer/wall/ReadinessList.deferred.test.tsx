/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@/test/render.js';
import { laterTasksUntil, updateInThisTask } from '@/test/react-tasks.js';
import { resetProject } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { parseStep } from '@/test/properties-panel-harness.js';
import type { ModelExtent } from '@/project/drawing-set';
import { WallIntro } from './WallIntro.js';

/**
 * #154: what the model lacks is read in the task after the one the model arrives in. On a large model the facts take
 * 50 to 60 ms, and the arrival's render also finishes the 3D and lays the set out, so reading them there made one long
 * task of the end of the load.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };

beforeEach(() => resetProject());
afterEach(() => {
  cleanup();
  useViewerStore.setState({ models: new Map() } as never);
});

describe('what the model lacks, when a model arrives', () => {
  it('is read in a later task, and then says the same as before', async () => {
    const ifcDataStore = await parseStep(new Uint8Array(readFileSync(new URL('../../../../public/samples/building-architecture.ifc', import.meta.url))));
    const root = render(<WallIntro modelName="building-architecture.ifc" extent={HOUSE} onHang={() => {}} />);
    const said = () => /5 of 11 elements are on no storey\./.test(root.textContent ?? '');
    assert.equal(said(), false, 'nothing is said while no model is open');

    await updateInThisTask(() => useViewerStore.setState({ models: new Map([['m', { ifcDataStore, name: 'building-architecture.ifc' }]]) } as never));
    assert.match(root.textContent ?? '', /Hang it on the wall/, 'the render of the arrival has run');
    assert.equal(said(), false, 'the facts are not read in the task the model arrives in');

    await laterTasksUntil(said);
    const text = root.textContent ?? '';
    assert.match(text, /4 of 11 elements have no quantity set/);
    assert.doesNotMatch(text, /material takeoff/, 'still the compact list of the intro');
  });
});
