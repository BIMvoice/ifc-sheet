/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A new version into the project: the wait for the model stops on an error, and the project is kept only while the new file loads. */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { modelVersionSwapActive, endModelVersionSwap } from '@/project/model-version';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore, type FederatedModel } from '@/store';
import { useWhatChanged } from './baseline.js';
import { snapshotFromElements } from './snapshot.js';
import { loadNewVersion, whenModelReady } from './version.js';

const model = { id: 'm', name: 'm', loadedAt: 1, visible: true, geometryResult: null } as unknown as FederatedModel;
const idle = { loading: false, geometryStreamingActive: false, error: null, models: new Map<string, FederatedModel>() };

beforeEach(() => { resetProject(); endModelVersionSwap(); useViewerStore.setState(idle); useWhatChanged.setState({ result: null, running: false, message: null }); });
afterEach(() => useViewerStore.setState(idle));

describe('whenModelReady', () => {
  it('resolves at once for a model that is read and drawn', async () => {
    useViewerStore.setState({ models: new Map([['m', model]]) });
    await whenModelReady(1000);
  });
  it('waits while the model loads and while its geometry streams, and resolves when both are done', async () => {
    useViewerStore.setState({ models: new Map([['m', model]]), loading: true });
    let ready = false;
    const done = whenModelReady(5000).then(() => { ready = true; });
    await new Promise((r) => setTimeout(r, 20));
    useViewerStore.setState({ loading: false, geometryStreamingActive: true });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(ready, false);
    useViewerStore.setState({ geometryStreamingActive: false });
    await done;
    assert.equal(ready, true);
  });
  it('stops at once, with the reason, when the load fails', async () => {
    useViewerStore.setState({ loading: true });
    const started = Date.now();
    const waiting = whenModelReady(60_000);
    useViewerStore.setState({ loading: false, error: 'not an IFC file' });
    await assert.rejects(waiting, /not an IFC file/);
    assert.ok(Date.now() - started < 1000);
  });
  it('gives up after its time', async () => {
    useViewerStore.setState({ loading: true });
    await assert.rejects(whenModelReady(30), /too long/);
  });
});

describe('loadNewVersion', () => {
  const file = new File(['x'], 'v2.ifc');
  const reference = snapshotFromElements([{ k: 'W1', t: 'IfcWall', d: 'd1' }], 1);

  it('refuses when there is no model to record as the reference', async () => {
    await assert.rejects(loadNewVersion(file, async () => {}, () => {}), /no model loaded/);
    assert.equal(modelVersionSwapActive(), false);
  });
  it('keeps the project while the new file loads, and not after', async () => {
    useProjectStore.setState({ modelState: reference });
    useViewerStore.setState({ models: new Map([['m', model]]) });
    let during: boolean | null = null;
    await loadNewVersion(file, async () => { during = modelVersionSwapActive(); }, () => {});
    assert.equal(during, true);
    assert.equal(modelVersionSwapActive(), false);
    assert.equal(useProjectStore.getState().modelState, reference, 'the reference is the old version until the user accepts the new one');
  });
  it('lets go of the project when the load fails, and reports why', async () => {
    useProjectStore.setState({ modelState: reference });
    await assert.rejects(loadNewVersion(file, async () => { throw new Error('disk gone'); }, () => {}), /disk gone/);
    assert.equal(modelVersionSwapActive(), false);
  });
  it('lets go of the project and stops when the new model reports an error after loading', async () => {
    useProjectStore.setState({ modelState: reference });
    await assert.rejects(loadNewVersion(file, async () => { useViewerStore.setState({ error: 'bad geometry' }); }, () => {}), /bad geometry/);
    assert.equal(modelVersionSwapActive(), false);
  });
});
