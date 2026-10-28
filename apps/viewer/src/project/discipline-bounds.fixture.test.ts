/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { disciplineViewFor, type DisciplineId } from './discipline-views';
import { viewOmits } from './discipline-facts';
import { drawingShownBy } from './view-shown';
import { styledDrawing } from './view-graphics';
import { partHostType } from './part-host';
import type { ProjectView } from './types';

/**
 * #257, on a real model through the real pipeline: the drawing a discipline plan puts on a sheet (the generated drawing as
 * the view's host stores it, then styled with the view's own filter) is framed on the lines and cut faces it has, not on
 * the whole model's drawing. AC20-FZK-Haus: its structural plan is two beams and a rafter (4 x 0.2 m) in a 13 x 20 m
 * model, its roof plan the roof in an 18 x 23 m frame.
 */

const extent = (d: { lines: { line: { start: { x: number; y: number }; end: { x: number; y: number } } }[]; cutPolygons: { polygon: { outer: { x: number; y: number }[] } }[] }) => {
  const xs: number[] = [], ys: number[] = [];
  for (const l of d.lines) xs.push(l.line.start.x, l.line.end.x), ys.push(l.line.start.y, l.line.end.y);
  for (const p of d.cutPolygons) for (const q of p.polygon.outer) xs.push(q.x), ys.push(q.y);
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
};

describe('discipline plans are framed on what they draw (#257)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let m: LoadedPlanModel;
  before(async () => { m = await loadPlanModel(FZK_HAUS); });

  /** The drawing as a sheet has it: the host's drawing (`drawingShownBy`), then the sheet's styling with the view's filter. */
  async function onSheet(id: DisciplineId, level: number): Promise<{ bounds: ReturnType<typeof extent>; content: ReturnType<typeof extent> }> {
    const view = { ...disciplineViewFor(id, m.levels[level], []), createdAt: 0 } as ProjectView;
    const generated = await m.planOf(view, { omits: 'none' });
    const stored = drawingShownBy(view, generated);
    const styled = styledDrawing(stored, view.graphics, partHostType, viewOmits(view), null);
    return { bounds: styled.bounds, content: extent(styled) };
  }

  // The roof plan sits on the highest storey, the others on the lowest (`defaultDisciplineLevel`).
  for (const id of ['structural', 'foundation', 'roof'] as const) {
    it(`the ${id} plan's bounds are the extent of its lines and cut faces`, async () => {
      const { bounds, content } = await onSheet(id, id === 'roof' ? 0 : m.levels.length - 1);
      for (const [a, b] of [[bounds.min.x, content.min.x], [bounds.min.y, content.min.y], [bounds.max.x, content.max.x], [bounds.max.y, content.max.y]]) assert.ok(Math.abs(a - b) < 1e-6, `${id}: ${JSON.stringify(bounds)} vs ${JSON.stringify(content)}`);
    });
  }

  it('the structural plan is much smaller than the model\'s drawing', async () => {
    const { bounds } = await onSheet('structural', m.levels.length - 1);
    assert.ok(bounds.max.x - bounds.min.x < 6 && bounds.max.y - bounds.min.y < 1, JSON.stringify(bounds));
  });
});
