/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A dimension DIMALL places says which door or window it measures, so it can be found orphaned. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { danglingAnnotations } from '@/check/findings.js';
import type { DraftEntity } from '@/drafting/types';
import { dimensionDrafts } from './apply.js';
import { house } from './fixture.js';
import { planDimensions } from './plan.js';

const target = { viewId: 'v', layerId: 'l', textHeight: 0.25, textStyle: 'Standard', dimStyle: 'Standard', guidOf: (id: number) => `G${id}` };
const drafts = () => dimensionDrafts(planDimensions(house(), { paperUnit: 0.1, textHeight: 0.25 }), target, []);
const widthOf = (d: DraftEntity): number => (d.shape.type === 'dimension' ? Math.round(Math.hypot(d.shape.b.x - d.shape.a.x, d.shape.b.y - d.shape.a.y) * 100) / 100 : NaN);

describe('what a DIMALL dimension measures', () => {
  it('stamps the span of a window or door width with that element, and no other span', () => {
    const stamped = drafts().filter((d) => typeof d.params.measures === 'string');
    // The two windows (2.00 each) and the door (1.00).
    assert.deepEqual(stamped.map(widthOf).sort(), [1, 2, 2]);
    assert.equal(new Set(stamped.map((d) => d.params.measures)).size, 3);
  });
  it('stamps nothing without a way to name the element', () => {
    const none = dimensionDrafts(planDimensions(house(), { paperUnit: 0.1, textHeight: 0.25 }), { ...target, guidOf: undefined }, []);
    assert.ok(none.every((d) => d.params.measures === undefined));
  });
  it('is an orphan once the element it measures is gone', () => {
    const all = drafts();
    const gone = all.find((d) => typeof d.params.measures === 'string')!;
    const found = danglingAnnotations({ views: [], sheets: [], drafts: all, planElements: () => [], elementExists: (g) => g !== gone.params.measures });
    assert.deepEqual(found.map((f) => [f.draftId, f.guids]), [[gone.id, [gone.params.measures]]]);
    assert.deepEqual(danglingAnnotations({ views: [], sheets: [], drafts: all, planElements: () => [], elementExists: () => true }), []);
  });
});
