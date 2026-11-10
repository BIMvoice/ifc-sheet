/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The app's plans take their plan symbols (#489) through `withViewPlanSymbols`: the same engine functions the headless
 * sheets use, so a drawing the tab or a sheet viewport shows equals the engine's; "Use plan symbols from the model" off, or a
 * view that is not a plan, leaves the drawing as it was cut.
 */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { IfcParser } from '@ifc-lite/parser';
import { readPlanSymbols, withPlanSymbols } from '@bimvoice/ifcsheet/plan-symbols';
import { BOX, CHAIR_1, CHAIR_2, planSymbolIfc } from '../../../../packages/ifcsheet/src/__fixtures__/plan-symbol-model';
import { useViewerStore } from '@/store';
import { withViewPlanSymbols } from './plan-symbols';

const line = (entityId: number, a: [number, number], b: [number, number]) => ({ line: { start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] } }, category: 'projection' as const, visibility: 'visible' as const, entityId, ifcType: 'IfcFurniture', modelIndex: 0, depth: 1 });
const cut: Drawing2D = {
  config: { plane: { axis: 'y', position: 1.2, flipped: false }, projectionDepth: 3 },
  lines: [line(CHAIR_1, [2, -3], [2.8, -3]), line(CHAIR_2, [5.5, -3], [5.5, -3.8]), line(BOX, [10, -3], [11, -3])], cutPolygons: [], projectionPolygons: [],
  bounds: { min: { x: 2, y: -3.8 }, max: { x: 11, y: -3 } }, stats: { cutLineCount: 0, projectionLineCount: 3, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
} as unknown as Drawing2D;

describe('the plan symbols of the loaded models in a view\'s drawing (#489)', () => {
  let expected: Drawing2D;
  before(async () => {
    const store = await new IfcParser().parseColumnar(new TextEncoder().encode(planSymbolIfc()).buffer as ArrayBuffer);
    // One model, no federation entry: the renderer ids are the express ids.
    useViewerStore.setState({ models: new Map(), ifcDataStore: store, geometryResult: null });
    expected = withPlanSymbols(cut, readPlanSymbols(store).symbols);
  });

  it('draws the symbols of a plan, equal to what the engine draws', () => {
    const drawn = withViewPlanSymbols(cut, { kind: 'plan' }, undefined);
    assert.deepEqual(drawn, expected);
    // The chairs are their symbols (a rectangle and an arc of chords, not the single line they were), the box its line.
    assert.ok(drawn.lines.filter((l) => l.entityId === CHAIR_1).length > 4);
    assert.deepEqual(drawn.lines.filter((l) => l.entityId === BOX), cut.lines.filter((l) => l.entityId === BOX));
  });

  it('leaves the cut when the view turns the symbols off, and for a view that is not a plan', () => {
    assert.equal(withViewPlanSymbols(cut, { kind: 'plan' }, { usePlanSymbols: false }), cut);
    assert.equal(withViewPlanSymbols(cut, { kind: 'section' }, undefined), cut);
    assert.equal(withViewPlanSymbols(cut, undefined, undefined), cut);
  });
});
