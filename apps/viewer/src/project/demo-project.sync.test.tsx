/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #850: a project started on the demo model holds a row for each material its walls and slabs are made of
 * (`demo-project.ts`), put there by `useProjectSync` as it starts the project; a project on any other model starts
 * with none, and the rows are the user's to change from then on. What the rows draw is `demo-project.bloc.test.ts`.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import type { IfcDataStore } from '@ifc-lite/parser';
import { cleanup, render } from '@/test/render';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { DEMO_MODEL } from '@/components/viewer/ifcsheet/demo-model';
import { resetProject, useProjectStore } from './project-store';
import { useProjectSync } from './project-sync';

function Harness() {
  useProjectSync();
  return null;
}

/** The materials a project starts with when a model named `name` is the one loaded. */
async function startingTable(name: string) {
  const model = { id: 'm1', name, ifcDataStore: {} as IfcDataStore, sourceContentHash: `hash:${name}` } as unknown as FederatedModel;
  useViewerStore.setState({ models: new Map([['m1', model]]), ifcDataStore: null });
  render(<Harness />);
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
  return (useProjectStore.getState().materials ?? []).map((m) => [m.name, m.hatch, m.hatchScale]);
}

beforeEach(() => { localStorage.clear(); resetProject(); });
afterEach(() => { cleanup(); localStorage.clear(); useViewerStore.setState({ models: new Map() }); resetProject(); });

it('the demo project starts with its materials hatched', async () => {
  assert.deepEqual(await startingTable(DEMO_MODEL.name), [
    ['Reinforced concrete', 'CONCRETE', 1],
    ['Brick masonry (zidărie de cărămidă)', 'BRICKCUT', 1],
    ['AAC block masonry (zidărie BCA)', 'BRICKCUT', 2],
  ]);
});

it('a project on another model starts with no materials', async () => {
  assert.deepEqual(await startingTable('Other.ifc'), []);
});
