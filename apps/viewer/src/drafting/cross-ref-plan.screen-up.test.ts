/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ElevationDirection, ProjectSheet, ProjectView } from '@/project/types';
import { annotationScreenUp, setAnnotationScreenUp } from './annotation';
import { withCrossReferences, type PlanCrossRefInput } from './cross-ref-plan';
import { sectionSymbolShapes } from './section-symbol';
import type { DraftEntity } from './types';

/**
 * The marks a plan prints are a function of the plan's own input, not of which
 * view the drafting session happens to hold: the session's screen-up
 * (`setAnnotationScreenUp`) is not an input of `withCrossReferences`.
 */

const plan = { id: 'plan', kind: 'plan', name: 'Ground', createdAt: 0, level: { elevation: 0 }, cutHeight: 1.2 } as unknown as ProjectView;
const section = { id: 'sec', kind: 'section', name: 'A', createdAt: 0 } as ProjectView;
const elevation = (direction: ElevationDirection): ProjectView => ({ id: `e-${direction}`, kind: 'elevation', name: direction, direction, createdAt: 0 });
const views: ProjectView[] = [plan, section, ...(['north', 'east', 'south', 'west'] as const).map(elevation)];
const onSheet = (viewId: string, i: number) => ({ id: `v${i}`, viewId, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null });
const sheets: ProjectSheet[] = [{ id: 's', number: 'A-301', name: 'Views', createdAt: 0, viewports: views.slice(1).map((v, i) => onSheet(v.id, i)) }];
const symbol: DraftEntity[] = sectionSymbolShapes({ x: 106, y: 198 }, { x: 106, y: 212 }, { x: 108, y: 205 }, 'A', 0.35).map((shape, i) => ({ id: `sym${i}`, viewId: 'plan', layerId: '0', shape, params: { sectionOf: 'sec' } }));
// Door swings round the places the marks start at: they must slide, and which way depends on how the boxes are measured.
const swing = (x: number, y: number) => ({ type: 'line' as const, a: { x, y }, b: { x: x + 0.9, y: y + 0.06 } });
const overlays = [{ layer: 'SYMBOLS', width: 0.13, shapes: [swing(106.1, 210.2), swing(105.4, 197.7), swing(112.2, 205), swing(99.2, 205.1)] }];

const input = (screenUp: 1 | -1): PlanCrossRefInput => ({
  drafts: symbol, view: plan, views, sheets, groundPlanId: 'plan', bounds: { min: { x: 100, y: 200 }, max: { x: 112, y: 210 } }, viewportScale: 100, overlays, screenUp,
});

/** The marks with the session holding `session`, then the session put back. */
function underSession(session: 1 | -1, screenUp: 1 | -1): DraftEntity[] {
  const was = annotationScreenUp();
  setAnnotationScreenUp(session);
  try {
    return withCrossReferences(input(screenUp));
  } finally {
    setAnnotationScreenUp(was);
  }
}

describe('withCrossReferences and the session screen-up', () => {
  it('places the same marks whichever way the session\'s screen-up points', () => {
    for (const up of [-1, 1] as const) assert.deepEqual(underSession(1, up), underSession(-1, up), `screenUp ${up}`);
  });

  it('measures with its own input: the two values place marks differently (the input is not inert)', () => {
    assert.notDeepEqual(underSession(1, -1), underSession(1, 1));
  });

  it('leaves the session\'s screen-up as it found it', () => {
    setAnnotationScreenUp(1);
    withCrossReferences(input(-1));
    assert.equal(annotationScreenUp(), 1);
  });
});
