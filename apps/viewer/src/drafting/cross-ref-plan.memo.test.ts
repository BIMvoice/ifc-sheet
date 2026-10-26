/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { withAnnotationScreenUp } from './annotation';
import { elevationMarkDrafts, type Box } from './cross-ref-marks';
import { withCrossReferences, type PlanCrossRefInput } from './cross-ref-plan';

/**
 * #154: a sheet asks for a plan viewport's cross-references three times a render and on every
 * render after, and placing them cost about 0.4 s of main-thread time a session on a large model.
 * They are placed once per input. A mark is placed by its text box, which is measured with the
 * session's screen-up direction, so the memo must not hand back marks measured the other way.
 */

const FOOTPRINT = { min: { x: 100, y: 200 }, max: { x: 112, y: 210 } };
const plan: ProjectView = { id: 'plan', kind: 'plan', name: 'Ground', createdAt: 0, scale: 100, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const north: ProjectView = { id: 'e-north', kind: 'elevation', name: 'North', direction: 'north', createdAt: 0 };
const south: ProjectView = { id: 'e-south', kind: 'elevation', name: 'South', direction: 'south', createdAt: 0 };
const sheets: ProjectSheet[] = [{ id: 's1', number: 'A-201', name: 'Elevations', createdAt: 0, viewports: [
  { id: 'v1', viewId: 'e-south', x: 100, y: 100, scale: 100, width: 0, height: 0, center: null },
  { id: 'v2', viewId: 'e-north', x: 300, y: 100, scale: 100, width: 0, height: 0, center: null },
] }];
const input = (): PlanCrossRefInput => ({ drafts: [], view: plan, views: [plan, north, south], sheets, groundPlanId: 'plan', bounds: FOOTPRINT, viewportScale: 100 });

describe('withCrossReferences places a plan\'s marks once per input (#154)', () => {
  it('hands back the same marks for the same input', () => {
    const one = input();
    const first = withCrossReferences(one);
    assert.ok(first.length > 0, 'the ground plan has elevation marks');
    assert.equal(withCrossReferences(one), first);
  });

  it('places them afresh for a new input', () => {
    assert.notEqual(withCrossReferences(input()), withCrossReferences(input()));
  });

  it('measures with the screen-up it is asked under, not the one it was first asked under', () => {
    const one = input();
    const up = withAnnotationScreenUp(1, () => withCrossReferences(one));
    const down = withAnnotationScreenUp(-1, () => withCrossReferences(one));
    // The fixture is sensitive to the direction, or the next assertion would prove nothing.
    assert.notDeepEqual(down, up);
    assert.deepEqual(down, withAnnotationScreenUp(-1, () => withCrossReferences(input())));
    assert.deepEqual(withAnnotationScreenUp(1, () => withCrossReferences(one)), withAnnotationScreenUp(1, () => withCrossReferences(input())));
  });
});

describe('elevationMarkDrafts takes the nearest clear place (#154 kept its tie rule)', () => {
  const mark = (obstacles: Box[]) => elevationMarkDrafts({ planViewId: 'plan', layerId: '0', views: [north], sheets, bounds: FOOTPRINT, paperUnit: 0.1, factor: 1, obstacles });
  const labelX = (obstacles: Box[]): number => {
    const d = mark(obstacles).find((m) => m.shape.type === 'text');
    assert.ok(d && d.shape.type === 'text');
    return d.shape.p.x;
  };

  it('on a tie between the two sides of an obstacle in the middle of the facade, takes the first (the west side)', () => {
    const home = labelX([]);
    // A box over the middle of the north facade, as wide either side of its centre, so both escapes are as near.
    const centre = mark([]).filter((m) => m.shape.type === 'line').flatMap((m) => (m.shape.type === 'line' ? [m.shape.a.x, m.shape.b.x] : []));
    const mid = (Math.min(...centre) + Math.max(...centre)) / 2;
    const blocked = labelX([{ x0: mid - 1, y0: FOOTPRINT.min.y - 3, x1: mid + 1, y1: FOOTPRINT.min.y }]);
    assert.ok(blocked < home, `slid west (${blocked} < ${home})`);
  });

  it('takes the nearer side when they are not as near', () => {
    const home = labelX([]);
    const centre = mark([]).filter((m) => m.shape.type === 'line').flatMap((m) => (m.shape.type === 'line' ? [m.shape.a.x, m.shape.b.x] : []));
    const mid = (Math.min(...centre) + Math.max(...centre)) / 2;
    // Reaching further west than east: the east side is the nearer escape.
    const blocked = labelX([{ x0: mid - 2, y0: FOOTPRINT.min.y - 3, x1: mid + 0.5, y1: FOOTPRINT.min.y }]);
    assert.ok(blocked > home, `slid east (${blocked} > ${home})`);
  });
});
