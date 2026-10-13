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
import { fingerprintsOf, snapshotElements, snapshotFromElements, snapshotOf } from './snapshot.js';

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
    { key: 'G1', ifcType: 'IfcWall', dataHash: 'abcdef0123456789', components: { 'attr:core': '123456789', 'pset:Pset_WallCommon': 'dropped', 'type-assignment': 'ffeeddcc' }, geometryHash: 77n, aabb: { min: [0, 0, 0], max: [4.00049, 0.2, 3] }, container: 'P/B/L1', ref: null },
    { key: 'missing:m:5', ifcType: 'IfcWall', dataHash: 'zzz', ref: null },
  ], (k) => (k === 'G1' ? 'Wall 1' : ''), 5);
  it('keeps what can be followed across versions, truncated and in whole millimetres, and drops what has no GlobalId', () => {
    assert.equal(state.count, 1);
    assert.deepEqual(snapshotElements(state), [{ k: 'G1', t: 'IfcWall', n: 'Wall 1', d: 'abcdef0123', c: { 'attr:core': '123456', 'type-assignment': 'ffeedd' }, g: (77n).toString(36), a: [0, 0, 0, 4, 0.2, 3], p: 'P/B/L1' }]);
  });
  it('is one line of the pretty-printed project file, not a line per number', () => {
    const text = JSON.stringify({ modelState: state }, null, 2);
    assert.ok(text.split('\n').length < 10, text);
  });
  it('reads back as it was written, and back into fingerprints', () => {
    assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(state)), '/modelState'), state);
    assert.equal(fingerprintsOf(state)[0].geometryHash, (77n).toString(36));
  });
  it('refuses a malformed state with the place of the problem', () => {
    const rows = (r: unknown[]) => JSON.stringify({ classes: ['IfcWall'], paths: [], rows: r });
    assert.throws(() => readSnapshot({ takenAt: 1, count: 1, rows: rows([['a', 0, 'c', '', -1, '', [1, 2], '']]) }, '/modelState'), /\/modelState\/rows\/0 must be an element row/);
    assert.throws(() => readSnapshot({ takenAt: 'now', count: 0, rows: rows([]) }, '/modelState'), /takenAt/);
    assert.throws(() => readSnapshot({ takenAt: 1, count: 2, rows: rows([]) }, '/modelState'), /\/count says 2 elements/);
    assert.throws(() => readSnapshot({ takenAt: 1, count: 0, rows: 'not json' }, '/modelState'), /\/rows is not readable/);
  });
  it('is about 130 bytes an element, 6.5 MB at 50 000', () => {
    const many = snapshotFromElements(Array.from({ length: 5000 }, (_, i) => ({
      k: `${String(i).padStart(5, '0')}Fr$t4X7Zf8NOew3F`.slice(0, 22), t: i % 7 ? 'IfcWall' : 'IfcDoor', n: `Basic Wall:Generic - 200mm:${i}`, d: 'abcdef0123', g: 'a1b2c3d4e', p: `Project/Building/Level ${i % 5}`,
      a: [i * 0.37, i * 0.11, 0, i * 0.37 + 4.123, i * 0.11 + 0.2, 3.05],
    })), 1);
    const perElement = many.rows.length / many.count;
    console.log(`snapshot size: ${Math.round(perElement)} bytes an element, ${(perElement * 50000 / 1e6).toFixed(1)} MB at 50 000`);
    assert.ok(perElement < 150, String(perElement));
  });
});

describe('what a new version is compared with', () => {
  const snap = (k: string) => snapshotFromElements([{ k, t: 'IfcWall', d: 'x' }], 1);
  beforeEach(() => resetProject());
  it('is nothing before anything was recorded', () => assert.equal(baselineOf(), null));
  it('is the state the project recorded, until an issue recorded the model: then the last such issue', () => {
    useProjectStore.setState({ modelState: snap('loaded') });
    assert.equal(snapshotElements(baselineOf()!.snapshot)[0].k, 'loaded');
    const issue = (id: string, model?: ReturnType<typeof snap>) => ({ id, name: id, date: '2026-10-13', createdAt: 1, sheets: [], ...(model ? { model } : {}) });
    useProjectStore.setState({ issues: [issue('i1', snap('first')), issue('i2', snap('second')), issue('i3')] });
    assert.equal(snapshotElements(baselineOf()!.snapshot)[0].k, 'second');
  });
});
