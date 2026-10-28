/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** DIMALIGNED attaches the points it is given to the model element they are a corner of (#459), and only those. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { anchorsOf, type ElementBox } from '../dimension-anchor';
import { clearDraftHistory } from '../draft-store';
import type { Pt } from '../types';
import { dimAlignedCommand } from './annotate';
import type { DraftContext } from './types';

const wall: ElementBox = { guid: 'WALL', rect: { x0: 0, y0: 0, x1: 4, y1: 0.2 } };
const other: ElementBox = { guid: 'COLUMN', rect: { x0: 6, y0: 0, x1: 6.4, y1: 0.4 } };

function run(points: Pt[], boxes: readonly ElementBox[], continuous = false) {
  const ctx = {
    viewId: 'plan', layerId: '0', settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard', dimContinuous: continuous },
    entities: () => useProjectStore.getState().drafts, say: () => {},
    elementBoxesAt: (p: Pt) => boxes.filter((b) => p.x >= b.rect.x0 - 0.02 && p.x <= b.rect.x1 + 0.02 && p.y >= b.rect.y0 - 0.02 && p.y <= b.rect.y1 + 0.02),
  } as unknown as DraftContext;
  const step = dimAlignedCommand.create(ctx);
  for (const p of points) step.onPoint?.(p);
  return useProjectStore.getState().drafts;
}

const guids = (d: ReturnType<typeof run>[number]) => anchorsOf(d).map((x) => [x.param, x.anchor.g]);

describe('DIMALIGNED anchors', () => {
  beforeEach(() => { resetProject(); clearDraftHistory(); });

  it('attaches each point that is a corner of an element, to that element', () => {
    const [d] = run([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 3, y: -1 }], [wall, other]);
    assert.deepEqual(guids(d), [['anchorA', 'WALL'], ['anchorB', 'COLUMN']]);
  });
  it('attaches nothing to a point in the open, or inside an element', () => {
    const [d] = run([{ x: 0.5, y: 0.1 }, { x: 10, y: 0 }, { x: 3, y: -1 }], [wall]);
    assert.deepEqual(guids(d), []);
    assert.equal(d.params.anchorA, undefined);
  });
  it('attaches only the end that is on an element', () => {
    const [d] = run([{ x: 4, y: 0.2 }, { x: 9, y: 0.2 }, { x: 5, y: 1 }], [wall]);
    assert.deepEqual(guids(d), [['anchorA', 'WALL']]);
  });
  it('carries the attachment of the end a continued dimension starts from, and attaches the new end', () => {
    const drafts = run([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: -1 }, { x: 6, y: 0 }], [wall, other], true);
    assert.equal(drafts.length, 2);
    assert.deepEqual(guids(drafts[0]), [['anchorA', 'WALL'], ['anchorB', 'WALL']]);
    assert.deepEqual(guids(drafts[1]), [['anchorA', 'WALL'], ['anchorB', 'COLUMN']]);
  });
  it('works in a context that has no pointer to ask (the set annotator)', () => {
    const ctx = { viewId: 'plan', layerId: '0', settings: { textHeight: 0.25, currentTextStyle: 'Standard', currentDimStyle: 'Standard' }, entities: () => [], say: () => {} } as unknown as DraftContext;
    const step = dimAlignedCommand.create(ctx);
    for (const p of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: -1 }]) step.onPoint?.(p);
    assert.equal(useProjectStore.getState().drafts.length, 1);
  });
});
