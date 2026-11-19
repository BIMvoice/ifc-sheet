/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** PEN (#833): a pointer stroke becomes one simplified polyline draft on its view, one undo step, drawn with the sheet. */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addProjectSheet, resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, draftsOfView } from '@/drafting/draft-store.js';
import { undoLatest } from '@/project/unified-undo';
import { attachDraftingView, cancelCommand, startDraftCommand, strokeEnd, strokeMove } from '@/drafting/session.js';
import { simplifyStroke } from '@/drafting/stroke.js';
import { draftCommandByName } from './registry.js';
import { PEN_LAYER, penCommand } from './pen.command.js';

beforeEach(() => { resetProject(); clearDraftHistory(); });
afterEach(() => { cancelCommand(); resetProject(); });

/** A wavy, nearly straight run of `n` points along x, 0.01 m apart, wobbling by 0.0001 m. */
const wavy = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i * 0.01, y: i % 2 ? 0.0001 : 0 }));

describe('PEN (#833)', () => {
  it('is reached by its name', () => {
    assert.equal(draftCommandByName('pen'), penCommand);
  });

  it('turns a 50 point stroke into one polyline on that view, with fewer points, in the red markup pen', () => {
    const viewId = addProjectSheet('A1', 'plans');
    attachDraftingView(viewId, 'down', () => []);
    assert.equal(startDraftCommand('pen'), true);
    const stroke = wavy(50);
    for (const p of stroke) strokeMove(p);
    strokeEnd(0.001);
    const drafts = useProjectStore.getState().drafts;
    assert.equal(drafts.length, 1);
    const d = drafts[0]!;
    assert.equal(d.viewId, viewId);
    assert.equal(d.layerId, PEN_LAYER);
    assert.equal(d.shape.type, 'polyline');
    const pts = d.shape.type === 'polyline' ? d.shape.pts : [];
    assert.ok(pts.length >= 2 && pts.length < 50, `kept ${pts.length}`);
    assert.deepEqual([pts[0], pts.at(-1)], [stroke[0], stroke[49]]);
    const layer = useProjectStore.getState().draftLayers.find((l) => l.id === PEN_LAYER);
    assert.deepEqual([layer?.color, layer?.lineWeight, layer?.visible, layer?.print], ['#dc2626', 0.35, true, undefined]);
    // The sheet draws what is drafted on it.
    assert.equal(draftsOfView(viewId, useProjectStore.getState().drafts, useProjectStore.getState().draftLayers).length, 1);
  });

  it('keeps the tool on for the next stroke, and one undo removes exactly one stroke', () => {
    const viewId = addProjectSheet('A1', 'plans');
    attachDraftingView(viewId, 'down', () => []);
    startDraftCommand('pen');
    for (const p of wavy(10)) strokeMove(p);
    strokeEnd(0.001);
    for (const p of wavy(10).map((q) => ({ x: q.x, y: q.y + 1 }))) strokeMove(p);
    strokeEnd(0.001);
    assert.equal(useProjectStore.getState().drafts.length, 2);
    undoLatest();
    assert.equal(useProjectStore.getState().drafts.length, 1);
  });

  it('a press with no movement draws nothing', () => {
    const viewId = addProjectSheet('A1', 'plans');
    attachDraftingView(viewId, 'down', () => []);
    startDraftCommand('pen');
    strokeMove({ x: 1, y: 1 });
    strokeEnd(0.001);
    assert.equal(useProjectStore.getState().drafts.length, 0);
  });
});

describe('simplifyStroke', () => {
  it('keeps a corner that is farther than the tolerance and drops the points on the sides', () => {
    const l = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
    assert.deepEqual(simplifyStroke(l, 0.01), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }]);
  });
});
