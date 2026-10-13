/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The command's words, the clouds and the saved state of WHATCHANGED. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cloudRing } from './cloud.js';
import { beforeEach } from 'node:test';
import { resetProject, useProjectStore } from '@/project/project-store';
import { baselineOf, parseWhatChanged } from './run.js';
import { readSnapshot } from './snapshot-file.js';
import { fingerprintsOf, snapshotOf } from './snapshot.js';

describe('WHATCHANGED command', () => {
  it('reads the command and its two words, and nothing else', () => {
    assert.equal(parseWhatChanged('WHATCHANGED'), 'compare');
    assert.equal(parseWhatChanged(' whatchanged  clear '), 'clear');
    assert.equal(parseWhatChanged('WHATCHANGED ACCEPT'), 'accept');
    assert.equal(parseWhatChanged('WHATCHANGED now'), null);
    assert.equal(parseWhatChanged('WHAT'), null);
  });
});

describe('revision cloud', () => {
  const box = { x0: 0, y0: 0, x1: 4, y1: 2 };
  const ring = cloudRing(box, 0.5);
  it('is a closed run of scallops round the box, bulging outward and never into it', () => {
    assert.ok(ring.length >= 40);
    const inside = ring.filter((p) => p.x > 1e-6 && p.x < 4 - 1e-6 && p.y > 1e-6 && p.y < 2 - 1e-6);
    assert.deepEqual(inside, []);
    assert.ok(Math.min(...ring.map((p) => p.x)) < -0.2 && Math.max(...ring.map((p) => p.x)) > 4.2 && Math.min(...ring.map((p) => p.y)) < -0.2 && Math.max(...ring.map((p) => p.y)) > 2.2);
  });
  it('is the same every time and has no jump between scallops larger than one', () => {
    assert.deepEqual(cloudRing(box, 0.5), ring);
    const gaps = ring.map((p, i) => Math.hypot(p.x - ring[(i + 1) % ring.length].x, p.y - ring[(i + 1) % ring.length].y));
    assert.ok(Math.max(...gaps) < 0.6, String(Math.max(...gaps)));
  });
});

describe('saved model state', () => {
  const state = snapshotOf([
    { key: 'G1', ifcType: 'IfcWall', dataHash: 'abc', components: { 'attr:core': '1' }, geometryHash: 77n, aabb: { min: [0, 0, 0], max: [4.00049, 0.2, 3] }, container: 'P/B/L1', ref: null },
    { key: 'missing:m:5', ifcType: 'IfcWall', dataHash: 'zzz', ref: null },
  ], (k) => (k === 'G1' ? 'Wall 1' : ''), 5);
  it('keeps what can be followed across versions, boxes to the millimetre, and drops what has no GlobalId', () => {
    assert.deepEqual(state.elements, [{ k: 'G1', t: 'IfcWall', n: 'Wall 1', d: 'abc', c: { 'attr:core': '1' }, g: '77', a: [0, 0, 0, 4, 0.2, 3], p: 'P/B/L1' }]);
  });
  it('reads back as it was written, and back into fingerprints', () => {
    assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(state)), '/modelState'), state);
    assert.equal(fingerprintsOf(state)[0].geometryHash, '77');
  });
  it('refuses a malformed state with the place of the problem', () => {
    assert.throws(() => readSnapshot({ takenAt: 1, elements: [{ k: 'a', t: 'b', d: 'c', a: [1, 2] }] }, '/modelState'), /\/modelState\/elements\/0\/a must be six numbers/);
    assert.throws(() => readSnapshot({ takenAt: 'now', elements: [] }, '/modelState'), /takenAt/);
  });
});

describe('what a new version is compared with', () => {
  const snap = (k: string) => ({ takenAt: 1, elements: [{ k, t: 'IfcWall', d: 'x' }] });
  beforeEach(() => resetProject());
  it('is nothing before anything was recorded', () => assert.equal(baselineOf(), null));
  it('is the state the project recorded, until an issue recorded the model: then the last such issue', () => {
    useProjectStore.setState({ modelState: snap('loaded') });
    assert.equal(baselineOf()?.snapshot.elements[0].k, 'loaded');
    const issue = (id: string, model?: ReturnType<typeof snap>) => ({ id, name: id, date: '2026-10-13', createdAt: 1, sheets: [], ...(model ? { model } : {}) });
    useProjectStore.setState({ issues: [issue('i1', snap('first')), issue('i2', snap('second')), issue('i3')] });
    assert.equal(baselineOf()?.snapshot.elements[0].k, 'second');
  });
});
