/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useViewerStore } from '@/store';
import { doorOperationOfRenderId } from './door-operation-read';

afterEach(() => useViewerStore.setState({ models: new Map() }));

describe('the swing a door states, by renderer id', () => {
  // Review of #505: a store without `entityIndex` (the stub models of other tests) throws inside `typeIndex`
  // and the door silently drew the default hand.
  it('logs, and draws the default, when the model cannot be read', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const store = { schemaVersion: 'IFC4', getEntity: () => null } as never;
    useViewerStore.setState({
      models: new Map([['m', { id: 'm', idOffset: 0, ifcDataStore: store } as never]]),
      resolveGlobalIdFromModels: () => ({ modelId: 'm', expressId: 7 }),
    } as never);
    assert.equal(doorOperationOfRenderId(7), null);
    const notes = warn.mock.calls.map((c) => String(c.arguments[0]));
    assert.equal(notes.length, 1, notes.join(' | '));
    assert.match(notes[0], /door 7 in m: its operation could not be read/);
  });
});
