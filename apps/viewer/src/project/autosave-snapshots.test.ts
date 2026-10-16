/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The autosave slot holds the drawings; the model state, which can be megabytes, is kept apart so it cannot fill it. And a new version of the model keeps the project. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { withoutModelState } from './autosave-snapshots.js';
import { beginModelVersionSwap, endModelVersionSwap, keepProjectForNewVersion, modelVersionSwapActive } from './model-version.js';
import { addProjectSheet, projectDocument, resetProject, useProjectStore } from './project-store.js';
import { serializeProject } from './project-file.js';

const big = (n: number) => snapshotFromElements(Array.from({ length: n }, (_, i) => ({ k: `G${i}`.padEnd(22, 'x'), t: 'IfcWall', n: `Wall ${i}`, d: 'abcdef0123', g: 'a1b2c3d4e', a: [i, 0, 0, i + 4, 0.2, 3] })), 1);

describe('the autosave slot', () => {
  beforeEach(() => resetProject());

  it('holds the project without the model state, which goes back where it was', () => {
    const doc = { ...projectDocument(), modelState: big(2000) };
    const { slim, modelState } = withoutModelState(doc);
    assert.equal(slim.modelState, undefined);
    assert.equal(modelState, doc.modelState);
    assert.ok(serializeProject(slim).length < 20_000, 'the slot is small');
    assert.ok(serializeProject(doc).length > 200_000, 'the project file carries it');
  });
  it('stays small for a model of 20 000 elements, whose state alone is over 2 million characters of a browser quota of 5 million', () => {
    const doc = { ...projectDocument(), modelState: big(20_000) };
    assert.ok(serializeProject(withoutModelState(doc).slim).length < 20_000);
    assert.ok(serializeProject(doc).length > 2_000_000, `${serializeProject(doc).length}`);
  });
  it('has no state to keep for a project that has none', () => {
    assert.equal(withoutModelState(projectDocument()).modelState, undefined);
  });
});

describe('a new version of the model', () => {
  beforeEach(() => { resetProject(); endModelVersionSwap(); });

  it('keeps the sheets, the reference and the drawings, and the project refers to the new model', () => {
    addProjectSheet('Plans');
    useProjectStore.setState({ models: [{ key: 'hash-v1', name: 'house.ifc' }], modelState: big(3) });
    beginModelVersionSwap();
    assert.equal(modelVersionSwapActive(), true);
    keepProjectForNewVersion([{ key: 'hash-v2', name: 'house-v2.ifc' }]);
    const s = useProjectStore.getState();
    assert.deepEqual(s.models, [{ key: 'hash-v2', name: 'house-v2.ifc' }]);
    assert.equal(s.sheets.length, 1);
    assert.ok(s.modelState);
    endModelVersionSwap();
    assert.equal(modelVersionSwapActive(), false);
  });
});
