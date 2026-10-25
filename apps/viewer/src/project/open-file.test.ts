/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Opening a file while a project is open: its next version is offered as an update, and the project stays. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNewVersion } from '@/whatchanged/version.js';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { useViewerStore, type FederatedModel } from '@/store';
import { useWhatChanged } from '@/whatchanged/baseline.js';
import { endModelVersionSwap, keepProjectForNewVersion, modelVersionSwapActive } from './model-version.js';
import { addProjectSheet, resetProject, useProjectStore } from './project-store.js';
import { openFileForProject, type OpenSeams } from './open-file.js';

const P = '0lY6P5Ur90TAQnnnI6wtnb';
const store = (guid: string) => ({ entityIndex: { byType: new Map([['IFCPROJECT', [2]]]) }, entities: { getGlobalId: () => guid } });
const model = { id: 'm', name: 'house.ifc', fileSize: 10, ifcDataStore: store(P), loadedAt: 1, visible: true, geometryResult: null } as unknown as FederatedModel;
const next = (guid: string, name = 'house-v2.ifc') => new File([`DATA;\n#2= IFCPROJECT('${guid}',$,'House',$,$,$,$,$,$);`], name);
const reference = snapshotFromElements([{ k: 'D1', t: 'IfcDoor', d: 'd1' }], 1);

function seams(answer: boolean, over: Partial<OpenSeams> = {}) {
  const calls: string[] = [];
  const s: OpenSeams = {
    models: () => [model],
    ask: async () => { calls.push('ask'); return answer; },
    open: async () => { calls.push('open'); },
    update: async () => { calls.push('update'); },
    failed: (reason) => { calls.push(`failed:${reason}`); },
    updated: () => { calls.push('updated'); },
    ...over,
  };
  return { s, calls };
}

describe('openFileForProject', () => {
  beforeEach(() => {
    resetProject(); endModelVersionSwap();
    useProjectStore.setState({ models: [{ key: 'v1', name: 'house.ifc' }] });
    useViewerStore.setState({ models: new Map([['m', model]]), loading: false, geometryStreamingActive: false, error: null });
    useWhatChanged.setState({ result: null, running: false, message: null });
  });

  it('offers the next version of the project\'s model as an update, and updates when accepted', async () => {
    const { s, calls } = seams(true);
    await openFileForProject(next(P), s);
    assert.deepEqual(calls, ['ask', 'update', 'updated']);
  });
  it('opens it as it always did when the offer is declined', async () => {
    const { s, calls } = seams(false);
    await openFileForProject(next(P), s);
    assert.deepEqual(calls, ['ask', 'open']);
  });
  it('does not ask about a file of another project', async () => {
    const { s, calls } = seams(true);
    await openFileForProject(next('1111111111111111111111'), s);
    assert.deepEqual(calls, ['open']);
  });
  it('does not ask when there is no project to keep', async () => {
    useProjectStore.setState({ models: [] });
    const { s, calls } = seams(true);
    await openFileForProject(next(P), s);
    assert.deepEqual(calls, ['open']);
  });
  it('says why when the update fails, and does not report it as done', async () => {
    const { s, calls } = seams(true, { update: async () => { throw new Error('disk gone'); } });
    await openFileForProject(next(P), s);
    assert.deepEqual(calls, ['ask', 'failed:disk gone']);
  });

  it('with the real update: the sheets stay, the project refers to the new file, and the swap ends', async () => {
    addProjectSheet('Plans');
    useProjectStore.setState({ modelState: reference });
    let during = false;
    const { s, calls } = seams(true, {
      update: (file) => loadNewVersion(file, async (f) => { during = modelVersionSwapActive(); keepProjectForNewVersion([{ key: 'v2', name: f.name }]); }, () => {}).catch(() => {}),
    });
    await openFileForProject(next(P), s);
    assert.equal(during, true);
    assert.equal(modelVersionSwapActive(), false);
    assert.deepEqual(calls, ['ask', 'updated']);
    const p = useProjectStore.getState();
    assert.equal(p.sheets.length, 1);
    assert.deepEqual(p.models.map((m) => m.name), ['house-v2.ifc']);
  });
});
