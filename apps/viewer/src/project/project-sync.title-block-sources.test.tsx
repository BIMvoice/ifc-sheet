/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { afterEach, beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { render, cleanup } from '@/test/render';
import { useViewerStore } from '@/store';
import type { IfcDataStore } from '@ifc-lite/parser';
import { resetProject } from './project-store';
import { autosaveKey, useProjectSync } from './project-sync';
import { setTitleBlockSources } from './sheets';

const SLOT = autosaveKey([{ key: 'legacy', name: 'Model' }]);
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 700)));

function Harness() {
  useProjectSync();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  resetProject();
  // One model with no storeys, loaded the legacy way: the autosave slot is `legacy`.
  useViewerStore.setState({ models: new Map(), ifcDataStore: {} as unknown as IfcDataStore });
});
afterEach(() => { cleanup(); localStorage.clear(); });

it('autosaves the project when only a title block field\'s model sources change', async () => {
  render(<Harness />);
  await settle();
  localStorage.removeItem(SLOT);
  act(() => { setTitleBlockSources('client', [{ kind: 'actor', role: 'CLIENT' }]); });
  await settle();
  const saved = localStorage.getItem(SLOT);
  assert.ok(saved, 'a title block source edit alone writes the autosave');
  assert.deepEqual(JSON.parse(saved).titleBlockSources?.client, [{ kind: 'actor', role: 'CLIENT' }]);
});
