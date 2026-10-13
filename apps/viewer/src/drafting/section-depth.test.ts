/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sectionSymbolShapes } from './section-symbol';
import { depthBandPolygon, depthFromPoint, depthGrip, depthHandle, sectionCutOf } from './section-depth';
import type { DraftEntity } from './types';

// A cut line along +x at y = 5, looking toward -y (the side point is below it).
const A = { x: 0, y: 5 };
const B = { x: 10, y: 5 };
const SIDE = { x: 5, y: 4 };

const parts = (): DraftEntity[] => sectionSymbolShapes(A, B, SIDE, 'A', 0.25).map((shape, i) => ({
  id: `e${i}`, viewId: 'plan', layerId: '0', shape, params: { sectionOf: 'sec1' },
}) as DraftEntity);

describe('section depth band', () => {
  it('finds the cut line and the viewing side from the symbol, in any order of its parts', () => {
    for (const list of [parts(), parts().reverse()]) {
      const cut = sectionCutOf(list);
      assert.ok(cut);
      assert.equal(cut.viewId, 'sec1');
      assert.deepEqual([cut.a, cut.b], [A, B]);
      assert.ok(cut.side.y < 5, 'the stem points toward the viewing side');
    }
  });

  it('is a band of the given depth on the viewing side only', () => {
    const cut = sectionCutOf(parts());
    assert.ok(cut);
    assert.deepEqual(depthBandPolygon(cut, 3), [{ x: 0, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 2 }, { x: 0, y: 2 }]);
  });

  it('puts the one handle in the middle of the far edge', () => {
    const cut = sectionCutOf(parts());
    assert.ok(cut);
    assert.deepEqual(depthHandle(cut, 3), { x: 5, y: 2 });
    assert.deepEqual(depthGrip(cut, 3)?.at, { x: 5, y: 2 });
    assert.equal(depthGrip(cut, 3)?.key, 'depth');
  });

  it('turns a dragged point into a depth along the normal, snapped, never behind the line', () => {
    const cut = sectionCutOf(parts());
    assert.ok(cut);
    assert.equal(depthFromPoint(cut, { x: 7, y: 2 }), 3, 'sideways drift does not matter');
    assert.equal(depthFromPoint(cut, { x: 5, y: 1.46 }), 3.55);
    assert.equal(depthFromPoint(cut, { x: 5, y: 5.2 }), 0.1, 'behind the line is the shallowest depth');
  });

  it('works the same on a slanted line', () => {
    const slanted = sectionSymbolShapes({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, 'B', 0.25).map((shape, i) => ({ id: `s${i}`, viewId: 'plan', layerId: '0', shape, params: { sectionOf: 's2' } }) as DraftEntity);
    const cut = sectionCutOf(slanted);
    assert.ok(cut);
    const h = depthHandle(cut, Math.SQRT2 * 2);
    assert.ok(h);
    assert.ok(Math.abs(h.x - 7) < 1e-9 && Math.abs(h.y - 3) < 1e-9, `${h.x},${h.y}`);
    assert.equal(depthFromPoint(cut, h), 2.85, 'snapped to the step');
  });
});

import { selectedSectionBand } from './section-depth';
import { automaticViewDepth } from '@/lib/section/automatic-depth';

describe('the band of the selected section', () => {
  const views = [{ id: 'sec1', viewDepth: 6 }];
  it('shows for a selected section symbol, at the view\'s depth', () => {
    const list = parts();
    const band = selectedSectionBand(new Set([list[1].id]), list, views);
    assert.equal(band?.depth, 6);
    assert.deepEqual(band?.grip.at, { x: 5, y: -1 });
  });
  it('falls back to the default for a view with no depth', () => {
    const list = parts();
    assert.equal(selectedSectionBand(new Set([list[0].id]), list, [{ id: 'sec1', viewDepth: null }])?.depth, 3);
  });
  it('shows the depth the drawing uses when the view has none of its own, and a drag starts there', () => {
    const list = parts();
    // A model 30 x 4 x 40 m: a plane that is not along an axis looks half the diagonal (25.1 m), not 3 m.
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 4, z: 40 } };
    const custom = { axis: 'front' as const, custom: { normal: [0, 0, 1] } };
    const band = selectedSectionBand(new Set([list[0].id]), list, [{ id: 'sec1', viewDepth: null, plane: custom }], bounds);
    assert.ok(Math.abs((band?.depth ?? 0) - Math.hypot(30, 4, 40) / 2) < 1e-9);
    assert.equal(band?.depth, automaticViewDepth(custom, bounds));
    // A cut along an axis looks half the model's depth on that axis.
    const front = selectedSectionBand(new Set([list[0].id]), list, [{ id: 'sec1', plane: { axis: 'front' as const } }], bounds);
    assert.equal(front?.depth, 20);
    // Its own depth always wins.
    assert.equal(selectedSectionBand(new Set([list[0].id]), list, [{ id: 'sec1', viewDepth: 6, plane: custom }], bounds)?.depth, 6);
  });
  it('shows nothing for no selection, a stray drawing or a section whose view is gone', () => {
    const list = parts();
    const own = { id: 'x', viewId: 'plan', layerId: '0', shape: { type: 'line' as const, a: A, b: B }, params: {} } as DraftEntity;
    assert.equal(selectedSectionBand(new Set(), list, views), null);
    assert.equal(selectedSectionBand(new Set(['x']), [...list, own], views), null);
    assert.equal(selectedSectionBand(new Set([list[0].id]), list, []), null);
  });
});
