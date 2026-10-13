/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * WHATCHANGED on every kind of view and in the right frame: the boxes a snapshot
 * keeps are absolute, the views are drawn in the render frame (shifted by the
 * geometry pass); a section keeps one side of its cut, not both; a detail and a
 * cropped viewport show only the part of the drawing they crop to.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { ProjectLevel, ProjectSheet, ProjectView } from '@/project/types';
import { viewBands } from './bands.js';
import { CLOUD_LIMIT } from './run.js';
import { groupBoxes } from './cloud.js';
import { compareStates, type ModelChange } from './compare.js';
import { sheetChanges, viewportRegion } from './report.js';
import { snapshotFromElements, type SnapElement } from './snapshot.js';
import { changesInView, cutBand, planBand, toRenderFrame } from './visibility.js';

const el = (k: string, a: number[]): SnapElement => ({ k, t: 'IfcWall', n: k, d: `d-${k}`, g: `g-${k}`, a });
const moved = (k: string, from: number[], to: number[]) => compareStates(snapshotFromElements([el(k, from)], 0), snapshotFromElements([{ ...el(k, to), g: 'g2' }], 0));

describe('the frame of the boxes', () => {
  // A georeferenced model: the file's coordinates are millions of metres from the render frame's origin.
  const offset = { x: 2_600_000, y: 437, z: 1_200_000 };
  const absolute = (b: number[]) => [b[0] + offset.x, b[1] + offset.y, b[2] + offset.z, b[3] + offset.x, b[4] + offset.y, b[5] + offset.z];
  const changes = moved('W', absolute([0, 0, 0, 4, 2.7, 0.3]), absolute([1, 0, 0, 5, 2.7, 0.3]));

  it('puts a changed element in the plan that shows it once its box is in the render frame, and in none before', () => {
    const plan = planBand('p', 0, 1.1);
    assert.deepEqual(changesInView(changes, plan), [], 'absolute against a render-frame band: never in view');
    assert.deepEqual(changesInView(toRenderFrame(changes, offset), plan).map((c) => c.guid), ['W']);
  });
  it('shifts where it was as well as where it is, and leaves a model with no offset as it is', () => {
    const [c] = toRenderFrame(changes, offset);
    assert.deepEqual([c.before, c.after], [[0, 0, 0, 4, 2.7, 0.3], [1, 0, 0, 5, 2.7, 0.3]]);
    const local = moved('W', [0, 0, 0, 4, 2.7, 0.3], [1, 0, 0, 5, 2.7, 0.3]);
    assert.deepEqual(toRenderFrame(local, { x: 0, y: 0, z: 0 }), local);
  });
});

describe('the side of its cut a section keeps', () => {
  const low = moved('low', [0, 0, 1, 4, 3, 1.3], [0.5, 0, 1, 4.5, 3, 1.3]);
  const high = moved('high', [0, 0, 9, 4, 3, 9.3], [0.5, 0, 9, 4.5, 3, 9.3]);
  const both = [...low, ...high];
  const names = (band: ReturnType<typeof cutBand>) => changesInView(both, band).map((c) => c.guid);
  it('keeps, unflipped, the depth below the cut position (the south elevation stands at the far end and keeps the model) and not what lies beyond it', () => {
    assert.deepEqual(names(cutBand('s', 'z', 5, 6)), ['low']);
    assert.deepEqual(names(cutBand('s', 'z', 5, 3)), []);
  });
  it('keeps, flipped, the other side', () => {
    assert.deepEqual(names(cutBand('s', 'z', 5, 6, true)), ['high']);
  });
});

describe('the bands of the project views', () => {
  const level: ProjectLevel = { name: 'EG', elevation: 3, storeyGlobalIds: ['S1'] };
  const plan = { id: 'plan', kind: 'plan', name: 'EG', level, cutHeight: 1.2 } as unknown as ProjectView;
  const section = (id: string, flipped: boolean, extra: object = {}) => ({ id, kind: 'section', name: id, plane: { axis: 'front', offset: 5, flipped }, viewDepth: 4, ...extra }) as unknown as ProjectView;
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 10 } };

  it('reads a plan from its depth below the cut up to the cut: its own depth when it has one, else down to its floor', () => {
    const [a] = viewBands([plan], [level], bounds).bands;
    assert.deepEqual([a.axis, a.from, a.to], ['y', 3, 4.2]);
    const [b] = viewBands([{ ...plan, viewDepth: 0.5 } as ProjectView], [level], bounds).bands;
    assert.deepEqual([b.from, b.to], [3.7, 4.2]);
  });
  it('reads a section on the side its flip says, and a detail as the view it was marked on, cropped to its area', () => {
    const detail = { ...section('d', false, { viewDepth: undefined }), detail: { of: 's', min: { x: 1, y: 1 }, max: { x: 2, y: 2 }, number: 1 } } as unknown as ProjectView;
    const { bands } = viewBands([section('s', false), section('f', true), detail], [level], bounds);
    const by = Object.fromEntries(bands.map((b) => [b.viewId, b]));
    assert.deepEqual([by.s.from, by.s.to], [1, 5]);
    assert.deepEqual([by.f.from, by.f.to], [5, 9]);
    assert.deepEqual([by.d.from, by.d.to, by.d.crop], [1, 5, { min: { x: 1, y: 1 }, max: { x: 2, y: 2 } }]);
  });
  it('says which views it cannot read: a section cut along a plane that is not along an axis', () => {
    const slanted = section('c', false, { plane: { axis: 'front', offset: 5, flipped: false, custom: { normal: [1, 0, 1], distance: 3, tangent: [0, 1, 0], bitangent: [0, 0, 1] } } });
    const { bands, unread } = viewBands([slanted], [level], bounds);
    assert.deepEqual([bands.length, unread], [0, ['c']]);
  });
});

describe('what a detail and a cropped viewport show', () => {
  const plane: SectionPlaneConfig = { axis: 'y', position: 4.2, flipped: false };
  const left = moved('left', [0, 3, 0, 1, 4, 1], [0.2, 3, 0, 1.2, 4, 1]);
  const right = moved('right', [20, 3, 0, 21, 4, 1], [20.2, 3, 0, 21.2, 4, 1]);
  const changes = [...left, ...right];
  const band = { ...planBand('p', 3, 4.2), plane };

  it('shows a detail only what is in the area it was marked on', () => {
    assert.deepEqual(changesInView(changes, band).map((c) => c.guid), ['left', 'right']);
    assert.deepEqual(changesInView(changes, { ...band, crop: { min: { x: -1, y: -1 }, max: { x: 5, y: 5 } } }).map((c) => c.guid), ['left']);
  });
  it('shows a sheet viewport that crops its drawing only what is in the crop, and a viewport that fits all of it everything', () => {
    const sheet = (vp: object): ProjectSheet => ({ id: 's', number: 'A-101', name: '', createdAt: 0, viewports: [{ id: 'vp', viewId: 'p', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null, ...vp }] } as ProjectSheet);
    const count = (vp: object) => sheetChanges([sheet(vp)], [band], changes, [])[0].count;
    assert.equal(count({}), 2);
    // 100 x 100 mm at 1:100 is 10 m of drawing, round the point (2, 0.5): the left wall only.
    assert.equal(count({ width: 100, height: 100, center: { x: 2, y: 0.5 } }), 1);
    assert.equal(count({ width: 100, height: 100, center: null }), 2);
    assert.deepEqual(viewportRegion({ id: 'x', viewId: 'p', x: 0, y: 0, scale: 50, width: 200, height: 100, center: { x: 1, y: 1 } }), { min: { x: -4, y: -1.5 }, max: { x: 6, y: 3.5 } });
  });
});

describe('the clouds of a view', () => {
  it('are at most CLOUD_LIMIT, and cover every box', () => {
    const boxes = Array.from({ length: 5000 }, (_, i) => ({ x0: i % 100, y0: Math.floor(i / 100), x1: (i % 100) + 0.5, y1: Math.floor(i / 100) + 0.5 }));
    const out = groupBoxes(boxes, CLOUD_LIMIT);
    assert.ok(out.length <= CLOUD_LIMIT && out.length > 1, String(out.length));
    for (const b of boxes) assert.ok(out.some((o) => o.x0 <= b.x0 && o.y0 <= b.y0 && o.x1 >= b.x1 && o.y1 >= b.y1));
  });
  it('are one each while they are few', () => {
    const boxes = [{ x0: 0, y0: 0, x1: 1, y1: 1 }, { x0: 5, y0: 5, x1: 6, y1: 6 }];
    assert.deepEqual(groupBoxes(boxes, CLOUD_LIMIT), boxes);
  });
});

describe('WHATCHANGED at a large size', () => {
  it('compares 20 000 elements and reads 50 views in well under a second', () => {
    const N = 20_000;
    const mk = (i: number, shifted: boolean): SnapElement => el(`G${i}`.padEnd(22, 'x'), [i % 100, (i % 10) * 3, Math.floor(i / 100), (i % 100) + 4, (i % 10) * 3 + 2.7, Math.floor(i / 100) + 0.3 + (shifted ? 0.5 : 0)]);
    const geometry = (e: SnapElement, shifted: boolean): SnapElement => (shifted ? { ...e, g: 'moved' } : e);
    const a = snapshotFromElements(Array.from({ length: N }, (_, i) => mk(i, false)), 0);
    const b = snapshotFromElements(Array.from({ length: N }, (_, i) => geometry(mk(i, i % 2 === 0), i % 2 === 0)), 0);
    const started = performance.now();
    const changes = toRenderFrame(compareStates(a, b), { x: 1000, y: 10, z: 2000 });
    const bands = Array.from({ length: 50 }, (_, v) => (v % 2 ? planBand(`v${v}`, (v % 10) * 3, (v % 10) * 3 + 1.2) : cutBand(`v${v}`, 'z', v * 4, 10)));
    const sheets = bands.map((band, v): ProjectSheet => ({ id: `s${v}`, number: `A-${v}`, name: '', createdAt: 0, viewports: [{ id: `p${v}`, viewId: band.viewId, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] }) as ProjectSheet);
    const report = sheetChanges(sheets, bands, changes, []);
    const ms = performance.now() - started;
    console.log(`WHATCHANGED perf: ${changes.length} changes, ${bands.length} views, ${Math.round(ms)} ms`);
    assert.equal(changes.length, N / 2);
    assert.ok(report.length === 50);
    assert.ok(ms < 1500, `took ${Math.round(ms)} ms`);
  });
});
