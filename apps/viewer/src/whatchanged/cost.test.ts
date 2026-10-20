/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * WHATCHANGED at a large size: fingerprints to a stored state, the comparison, every view's band over every
 * change, the sheets and the clouds, for 20 000 elements and 50 views. Half the elements move, so every
 * stage has work. A pass that looked an element up by scanning the other version (20 000 x 20 000 = 4e8
 * steps; measured at 984 ms for the lookups alone) or tested each change against each view by building its
 * drawing rectangle first would miss the first bound; the second test fails when the work grows faster than the model.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import type { EntityFingerprint } from '@ifc-lite/diff';
import type { ProjectSheet } from '@/project/types';
import { cloudBoxes, groupBoxes } from './cloud.js';
import { compareStates } from './compare.js';
import { sheetChanges } from './report.js';
import { CLOUD_LIMIT } from './run.js';
import { snapshotOf } from './snapshot.js';
import { cutBand, planBand, toRenderFrame, type ViewBand } from './visibility.js';

const fingerprints = (n: number, shifted: boolean): EntityFingerprint<null>[] => Array.from({ length: n }, (_, i) => {
  const move = shifted && i % 2 === 0;
  const x = i % 100, y = (i % 10) * 3, z = Math.floor(i / 100);
  return {
    key: `G${i}`.padEnd(22, 'x'), ifcType: i % 7 ? 'IfcWall' : 'IfcDoor', dataHash: `data${i}`, geometryHash: move ? `moved${i}` : `geo${i}`,
    aabb: { min: [x + (move ? 0.5 : 0), y, z], max: [x + 4 + (move ? 0.5 : 0), y + 2.7, z + 0.3] }, container: `Project/Building/Level ${i % 5}`, ref: null,
  };
});

const plane: SectionPlaneConfig = { axis: 'y', position: 0, flipped: false };
const bandsOf = (views: number): ViewBand[] => Array.from({ length: views }, (_, v) => ({
  ...(v % 2 ? planBand(`v${v}`, (v % 10) * 3, (v % 10) * 3 + 1.2) : cutBand(`v${v}`, 'z', v * 4, 10)), plane,
}));

/** Everything WHATCHANGED does after the model is read, in milliseconds. */
function pass(n: number, views: number): { ms: number; changes: number; clouds: number } {
  const started = performance.now();
  const before = snapshotOf(fingerprints(n, false), (k) => k, 0);
  const after = snapshotOf(fingerprints(n, true), (k) => k, 0);
  const changes = toRenderFrame(compareStates(before, after), { x: 1000, y: 10, z: 2000 });
  const bands = bandsOf(views);
  const sheets = bands.map((band, v): ProjectSheet => ({ id: `s${v}`, number: `A-${v}`, name: '', createdAt: 0, viewports: [{ id: `p${v}`, viewId: band.viewId, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] }) as ProjectSheet);
  const report = sheetChanges(sheets, bands, changes, []);
  const clouds = bands.reduce((sum, band) => sum + groupBoxes(cloudBoxes(changes, band), CLOUD_LIMIT).length, 0);
  assert.equal(report.length, views);
  assert.equal(changes.length, n / 2);
  return { ms: performance.now() - started, changes: changes.length, clouds };
}

describe('WHATCHANGED at a large size', () => {
  it('reads 20 000 elements and 50 views in well under a second', () => {
    pass(2000, 5); // warm the engine up
    const { ms, changes, clouds } = pass(20_000, 50);
    console.log(`WHATCHANGED cost: ${changes} changes, 50 views, ${clouds} clouds, ${Math.round(ms)} ms`);
    assert.ok(ms < 600, `took ${Math.round(ms)} ms`);
  });
  it('grows with the model, not with its square: four times the elements take less than eight times as long', () => {
    pass(2000, 5);
    const small = Math.min(...[1, 2, 3].map(() => pass(5000, 50).ms));
    const large = Math.min(...[1, 2, 3].map(() => pass(20_000, 50).ms));
    console.log(`WHATCHANGED scaling: 5 000 elements ${Math.round(small)} ms, 20 000 elements ${Math.round(large)} ms (x${(large / small).toFixed(1)})`);
    assert.ok(large < 8 * small, `x${(large / small).toFixed(1)}`);
  });
});
