/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The command's words, the clouds it draws, the reference it compares with and the state it saves. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDraft } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { useWhatChanged } from './baseline.js';
import { cloudRing } from './cloud.js';
import { parseMode, REVISION_STAMP, REVISIONS_LAYER, runGuarded, runWhatChanged } from './run.js';
import { readSnapshot } from './snapshot-file.js';
import { fingerprintsOf, snapshotElements, snapshotFromElements, snapshotOf, type ModelSnapshot, type SnapElement } from './snapshot.js';

describe('WHATCHANGED command', () => {
  it('reads the words after the name: nothing, CLEAR or ACCEPT, and nothing else', () => {
    assert.equal(parseMode(''), 'compare');
    assert.equal(parseMode(' clear '), 'clear');
    assert.equal(parseMode('ACCEPT'), 'accept');
    assert.equal(parseMode('now'), null);
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
    assert.ok(JSON.stringify({ modelState: state }, null, 2).split('\n').length < 10);
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

describe('a run against the reference', () => {
  const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
  const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  const wall = (over: Partial<SnapElement> = {}): SnapElement => ({ k: 'W1', t: 'IfcWall', n: 'Wall 1', d: 'd1', g: 'g1', a: [0, 0, 0, 4, 0.9, 0.3], ...over });
  const state = (...e: SnapElement[]): ModelSnapshot => snapshotFromElements(e, 1);
  const v1 = state(wall(), { k: 'D1', t: 'IfcDoor', n: 'Door 1', d: 'd2', g: 'g2', a: [6, 0, 0, 7, 0.9, 0.3] });
  const v2 = state(wall({ g: 'g1b', a: [0.5, 0, 0, 4.5, 0.9, 0.3] }));
  const run = async (mode: 'compare' | 'clear' | 'accept', current: ModelSnapshot | null): Promise<string[]> => {
    const said: string[] = [];
    await runWhatChanged(mode, (l) => said.push(l), async () => current);
    return said;
  };
  const clouds = () => useProjectStore.getState().drafts.filter((d) => d.params.revision === REVISION_STAMP);

  beforeEach(() => {
    resetProject();
    useWhatChanged.setState({ result: null, running: false, message: null });
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
    startDrawingSet(null, HOUSE);
  });

  it('records the model as the reference the first time, and compares nothing', async () => {
    const said = await run('compare', v1);
    assert.equal(useProjectStore.getState().modelState, v1);
    assert.equal(clouds().length, 0);
    assert.match(said[0], /recorded as the reference/);
  });
  it('compares a later version with the reference, lists the sheets that show a change and draws clouds on a Revisions layer', async () => {
    useProjectStore.setState({ modelState: v1 });
    const said = await run('compare', v2);
    const { result } = useWhatChanged.getState();
    assert.equal(result?.changed, 2, 'the wall moved, the door is gone');
    const shown = result!.sheets.filter((s) => s.count > 0);
    assert.ok(shown.length > 0, said.join('\n'));
    assert.ok(said.some((l) => /A-\d+: \d+ change/.test(l)), said.join('\n'));
    assert.ok(clouds().length >= 3, 'the new and the old place of the wall, the old place of the door');
    assert.ok(clouds().every((d) => d.layerId === REVISIONS_LAYER && d.shape.type === 'polyline'));
    assert.deepEqual(useProjectStore.getState().draftLayers.filter((l) => l.id === REVISIONS_LAYER).map((l) => l.name), ['Revisions']);
    assert.equal(useProjectStore.getState().modelState, v1, 'comparing does not move the reference');
  });
  it('replaces the last run\'s clouds with its own, and never adds the layer twice', async () => {
    useProjectStore.setState({ modelState: v1 });
    await run('compare', v2);
    const first = clouds().map((d) => d.id);
    await run('compare', v2);
    assert.equal(clouds().length, first.length);
    assert.ok(clouds().every((d) => !first.includes(d.id)));
    assert.equal(useProjectStore.getState().draftLayers.filter((l) => l.id === REVISIONS_LAYER).length, 1);
  });
  it('CLEAR removes the clouds and keeps the reference; ACCEPT takes the model as the reference and removes them', async () => {
    useProjectStore.setState({ modelState: v1 });
    await run('compare', v2);
    await run('clear', null);
    assert.equal(clouds().length, 0);
    assert.equal(useProjectStore.getState().modelState, v1);
    await run('compare', v2);
    assert.ok(clouds().length > 0);
    await run('accept', v2);
    assert.equal(clouds().length, 0);
    assert.equal(useProjectStore.getState().modelState, v2);
    assert.equal(useWhatChanged.getState().result, null);
    assert.match((await run('compare', v2))[0], /0 elements changed/);
  });
  it('carries the label of a wall that moved with it, once however often the run is repeated', async () => {
    const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan')!;
    const at = { x: 2, y: -1 };
    const label = newDraft(plan.id, '0', { type: 'text', p: at, text: 'Wall 1', height: 0.25, rotation: 0 }, { labelOf: 'W1', atype: 'tagall-mark' });
    useProjectStore.setState({ modelState: v1, drafts: [...useProjectStore.getState().drafts, label] });
    const place = () => (useProjectStore.getState().drafts.find((d) => d.id === label.id)!.shape as { p: { x: number; y: number } }).p;
    await run('compare', v2);
    const moved = place();
    assert.ok(Math.abs(Math.hypot(moved.x - at.x, moved.y - at.y) - 0.5) < 1e-6, `half a metre, got ${JSON.stringify(moved)}`);
    await run('compare', v2);
    assert.deepEqual(place(), moved, 'the second run adds nothing');
  });
  it('says there is no model rather than comparing with nothing, and a failure is said and does not leave the run locked', async () => {
    useProjectStore.setState({ modelState: v1 });
    assert.match((await run('compare', null))[0], /No model is loaded/);
    const said: string[] = [];
    await runGuarded('compare', (l) => said.push(l));
    assert.match(said[0], /No model is loaded|still loading/);
    assert.equal(useWhatChanged.getState().running, false);
    assert.equal(useWhatChanged.getState().message, said[0]);
  });
});
