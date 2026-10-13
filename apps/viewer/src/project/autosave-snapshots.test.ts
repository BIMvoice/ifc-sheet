/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The autosave slot holds the drawings; the model snapshots, which can be megabytes, are kept apart so they cannot fill it. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { withLatestIssue } from '@/issue/plan.js';
import { resetProject, projectDocument } from './project-store.js';
import { serializeProject } from './project-file.js';
import { withoutSnapshots, withSnapshots } from './autosave-snapshots.js';
import type { ProjectIssue } from './types.js';

const big = (n: number) => snapshotFromElements(Array.from({ length: n }, (_, i) => ({ k: `G${i}`.padEnd(22, 'x'), t: 'IfcWall', n: `Wall ${i}`, d: 'abcdef0123', g: 'a1b2c3d4e', a: [i, 0, 0, i + 4, 0.2, 3] })), 1);
const issue = (id: string, model?: ReturnType<typeof big>): ProjectIssue => ({ id, name: id, date: '2026-10-13', createdAt: 1, sheets: [], ...(model ? { model } : {}) });

describe('the autosave slot', () => {
  it('holds the project without its snapshots, and the snapshots go back where they were', () => {
    resetProject();
    const doc = { ...projectDocument(), modelState: big(2000), issues: [issue('i1', big(2000)), issue('i2')] };
    const { slim, snapshots } = withoutSnapshots(doc);
    assert.equal(slim.modelState, undefined);
    assert.ok(slim.issues!.every((i) => i.model === undefined));
    assert.deepEqual(withSnapshots(slim, snapshots), doc);
    assert.ok(serializeProject(slim).length < 20_000, 'the slot is small');
    assert.ok(serializeProject(doc).length > 200_000, 'the file carries them');
  });

  it('stays under the localStorage quota (about 5 million characters) for a model of 20 000 elements', () => {
    resetProject();
    const doc = { ...projectDocument(), modelState: big(20_000), issues: [issue('i1', big(20_000))] };
    assert.ok(serializeProject(withoutSnapshots(doc).slim).length < 100_000);
    assert.ok(serializeProject(doc).length > 4_000_000, 'with its snapshots the slot would be at the quota');
  });

  it('does not put a snapshot back over one the document has', () => {
    const doc = { ...projectDocument(), modelState: big(3) };
    assert.equal(withSnapshots(doc, { modelState: big(9), issues: {} }).modelState, doc.modelState);
  });
});

describe('issues and their snapshots', () => {
  it('only the newest issue keeps the snapshot it was issued against', () => {
    const issues = withLatestIssue([issue('i1', big(3)), issue('i2', big(3))], issue('i3', big(3)));
    assert.deepEqual(issues.map((i) => i.model !== undefined), [false, false, true]);
  });
});
