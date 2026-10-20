/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * WHATCHANGED on every kind of view and in the right frame: the boxes a snapshot keeps are absolute, the
 * views are drawn in the render frame (shifted by the geometry pass); a section keeps one side of its cut,
 * not both; a plan sees up to its storey's ceiling; a cropped viewport shows only the part it crops to.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { ProjectLevel, ProjectSheet, ProjectView } from '@/project/types';
import { useViewerStore, type FederatedModel } from '@/store';
import { viewBands } from './bands.js';
import { cloudBoxes, groupBoxes } from './cloud.js';
import { compareStates } from './compare.js';
import { renderFrameOffset } from './frame.js';
import { sheetChanges, viewportRegion } from './report.js';
import { CLOUD_LIMIT, compareInRenderFrame } from './run.js';
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
  it('is how WHATCHANGED compares two versions of a model', () => {
    const base = snapshotFromElements([el('W', absolute([0, 0, 0, 4, 2.7, 0.3]))], 0);
    const head = snapshotFromElements([{ ...el('W', absolute([1, 0, 0, 5, 2.7, 0.3])), g: 'g2' }], 0);
    assert.deepEqual(changesInView(compareInRenderFrame(base, head, offset), planBand('p', 0, 1.1)).map((c) => c.guid), ['W']);
  });
  it('shifts where it was as well as where it is, and leaves a model with no offset as it is', () => {
    const [c] = toRenderFrame(changes, offset);
    assert.deepEqual([c.before, c.after], [[0, 0, 0, 4, 2.7, 0.3], [1, 0, 0, 5, 2.7, 0.3]]);
    const local = moved('W', [0, 0, 0, 4, 2.7, 0.3], [1, 0, 0, 5, 2.7, 0.3]);
    assert.deepEqual(toRenderFrame(local, { x: 0, y: 0, z: 0 }), local);
  });
  describe('the offset the viewer applied', () => {
    afterEach(() => useViewerStore.setState({ models: new Map(), geometryResult: null }));
    it('is the RTC offset (IFC axes, Z up) and the origin shift (Y up) of the geometry pass, in Y-up axes', () => {
      // wasmRtcOffset is IFC (x, y, z) = (E, N, height); the render frame is Y up: (E, height, -N).
      const coordinateInfo = { wasmRtcOffset: { x: 2_600_000, y: 1_200_000, z: 437 }, originShift: { x: 5, y: 1, z: -2 } };
      const model = { id: 'm', name: 'm', loadedAt: 1, visible: true, geometryResult: { coordinateInfo } } as unknown as FederatedModel;
      useViewerStore.setState({ models: new Map([['m', model]]) });
      assert.deepEqual(renderFrameOffset(), { x: 2_600_005, y: 438, z: -1_200_002 });
    });
    it('is nothing for a model that was not shifted', () => {
      assert.deepEqual(renderFrameOffset(), { x: 0, y: 0, z: 0 });
    });
  });
});

describe('the side of its cut a section keeps', () => {
  const low = moved('low', [0, 0, 1, 4, 3, 1.3], [0.5, 0, 1, 4.5, 3, 1.3]);
  const high = moved('high', [0, 0, 9, 4, 3, 9.3], [0.5, 0, 9, 4.5, 3, 9.3]);
  const both = [...low, ...high];
  const names = (band: ReturnType<typeof cutBand>) => changesInView(both, band).map((c) => c.guid);
  it('keeps, unflipped, the depth below the cut position and not what lies beyond it', () => {
    assert.deepEqual(names(cutBand('s', 'z', 5, 6)), ['low']);
    assert.deepEqual(names(cutBand('s', 'z', 5, 3)), []);
  });
  it('keeps, flipped, the other side', () => {
    assert.deepEqual(names(cutBand('s', 'z', 5, 6, true)), ['high']);
  });
});

describe('the bands of the project views', () => {
  const ground: ProjectLevel = { name: 'EG', elevation: 3, storeyGlobalIds: ['S1'] };
  const upper: ProjectLevel = { name: 'OG', elevation: 6, storeyGlobalIds: ['S2'] };
  const plan = (level: ProjectLevel, extra: object = {}) => ({ id: `plan-${level.name}`, kind: 'plan', name: level.name, level, cutHeight: 1.2, ...extra }) as unknown as ProjectView;
  const section = (id: string, flipped: boolean, extra: object = {}) => ({ id, kind: 'section', name: id, plane: { axis: 'front', offset: 5, flipped }, viewDepth: 4, ...extra }) as unknown as ProjectView;
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 9, z: 10 } };
  const by = (views: ProjectView[]) => Object.fromEntries(viewBands(views, [ground, upper], bounds).bands.map((b) => [b.viewId, b]));

  it('reads a plan from its depth below the cut up to the ceiling of its storey (the next level), the top storey up to the top of the model', () => {
    const a = by([plan(ground), plan(upper)]);
    assert.deepEqual([a['plan-EG'].axis, a['plan-EG'].from, a['plan-EG'].to], ['y', 3, 6]);
    assert.deepEqual([a['plan-OG'].from, a['plan-OG'].to], [6, 9]);
  });
  it('reads a plan with a depth of its own from that depth below the cut', () => {
    const a = by([plan(ground, { viewDepth: 0.5 })]);
    assert.equal(a['plan-EG'].from, 3.7);
  });
  it('reads a section on the side its flip says, over its own depth', () => {
    const a = by([section('s', false), section('f', true)]);
    assert.deepEqual([a.s.from, a.s.to], [1, 5]);
    assert.deepEqual([a.f.from, a.f.to], [5, 9]);
  });
  it('reads a section with no depth of its own over half the model\'s extent along the cut, as the drawing does', () => {
    const a = by([section('s', false, { viewDepth: null })]);
    assert.deepEqual([a.s.from, a.s.to], [0, 5]);
  });
  it('says which views it cannot read: a section cut along a plane that is not along an axis', () => {
    const slanted = section('c', false, { plane: { axis: 'front', offset: 5, flipped: false, custom: { normal: [1, 0, 1], distance: 3, tangent: [0, 1, 0], bitangent: [0, 0, 1] } } });
    const { bands, unread } = viewBands([slanted], [ground], bounds);
    assert.deepEqual([bands.length, unread], [0, ['c']]);
  });
});

describe('what a cropped viewport shows', () => {
  const plane: SectionPlaneConfig = { axis: 'y', position: 4.2, flipped: false };
  const left = moved('left', [0, 3, 0, 1, 4, 1], [0.2, 3, 0, 1.2, 4, 1]);
  const right = moved('right', [20, 3, 0, 21, 4, 1], [20.2, 3, 0, 21.2, 4, 1]);
  const changes = [...left, ...right];
  const band = { ...planBand('p', 3, 4.2), plane };
  const sheet = (vp: object): ProjectSheet => ({ id: 's', number: 'A-101', name: '', createdAt: 0, viewports: [{ id: 'vp', viewId: 'p', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null, ...vp }] } as ProjectSheet);
  const count = (vp: object) => sheetChanges([sheet(vp)], [band], changes, [])[0].count;

  it('shows a sheet viewport that crops its drawing only what is in the crop, and a viewport that fits all of it everything', () => {
    assert.equal(count({}), 2);
    // 100 x 100 mm at 1:100 is 10 m of drawing, round the point (2, 0.5): the left wall only.
    assert.equal(count({ width: 100, height: 100, center: { x: 2, y: 0.5 } }), 1);
    assert.equal(count({ width: 100, height: 100, center: null }), 2);
    assert.deepEqual(viewportRegion({ id: 'x', viewId: 'p', x: 0, y: 0, scale: 50, width: 200, height: 100, center: { x: 1, y: 1 } }), { min: { x: -4, y: -1.5 }, max: { x: 6, y: 3.5 } });
  });
  it('counts an element seen through two viewports of one view once', () => {
    const two = { ...sheet({}), viewports: [...sheet({}).viewports!, { ...sheet({}).viewports![0], id: 'vp2' }] };
    assert.equal(sheetChanges([two], [band], changes, [])[0].count, 2);
  });
});

describe('the clouds of a view', () => {
  const plane: SectionPlaneConfig = { axis: 'y', position: 4.2, flipped: false };
  const band = { ...planBand('p', 3, 4.2), plane };
  it('are drawn round the new place of an element that moved and round its old place too', () => {
    const [m] = moved('W', [0, 3, 0, 4, 4, 1], [10, 3, 0, 14, 4, 1]);
    assert.deepEqual(cloudBoxes([m], band).map((r) => [r.x0, r.x1]), [[10, 14], [0, 4]]);
  });
  it('are drawn round the old place of an element that was removed, and the new place of one that was added', () => {
    const removed = compareStates(snapshotFromElements([el('W', [0, 3, 0, 4, 4, 1])], 0), snapshotFromElements([], 0));
    const added = compareStates(snapshotFromElements([], 0), snapshotFromElements([el('N', [6, 3, 0, 8, 4, 1])], 0));
    assert.deepEqual(cloudBoxes(removed, band).map((r) => [r.x0, r.x1]), [[0, 4]]);
    assert.deepEqual(cloudBoxes(added, band).map((r) => [r.x0, r.x1]), [[6, 8]]);
  });
  it('leave out a place the view does not show: a moved element whose old place is above the view\'s band', () => {
    const [m] = moved('W', [0, 9, 0, 4, 10, 1], [0, 3, 0, 4, 4, 1]);
    assert.deepEqual(cloudBoxes([m], band).map((r) => [r.x0, r.x1]), [[0, 4]]);
  });
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
