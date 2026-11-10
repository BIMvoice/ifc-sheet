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
  async function onSheet(id: DisciplineId, level: number, viewDepth?: number): Promise<{ bounds: ReturnType<typeof extent>; content: ReturnType<typeof extent>; ids: Set<number> }> {
    const view = { ...disciplineViewFor(id, m.levels[level], []), createdAt: 0, ...(viewDepth === undefined ? {} : { viewDepth }) } as ProjectView;
    const generated = await m.planOf(view, { omits: 'none' });
    const stored = drawingShownBy(view, generated);
    const styled = styledDrawing(stored, view.graphics, partHostType, viewOmits(view), null);
    return { bounds: styled.bounds, content: extent(styled), ids: m.drawnIds(styled) };
  }

  // The roof plan sits on the highest storey, the others on the lowest (`defaultDisciplineLevel`).
  for (const id of ['structural', 'foundation', 'roof'] as const) {
    it(`the ${id} plan's bounds are the extent of its lines and cut faces`, async () => {
      const { bounds, content } = await onSheet(id, id === 'roof' ? 0 : m.levels.length - 1);
      for (const [a, b] of [[bounds.min.x, content.min.x], [bounds.min.y, content.min.y], [bounds.max.x, content.max.x], [bounds.max.y, content.max.y]]) assert.ok(Math.abs(a - b) < 1e-6, `${id}: ${JSON.stringify(bounds)} vs ${JSON.stringify(content)}`);
    });
  }

  // #628: the ground slab lies exactly 1.2 m under the Erdgeschoss cut, on the edge of the default 1.2 m band, so the
  // structural plan draws it at the default depth (before #628 the cut's float noise left it out and the plan framed
  // on the beams alone). 1.1 m puts it outside the band, where only the beams are left.
  it('the structural plan is much smaller than the model\'s drawing, with the slab outside the band (1.1 m)', async () => {
    const { bounds, ids } = await onSheet('structural', m.levels.length - 1, 1.1);
    assert.ok(ids.size > 0, 'the plan draws something, or its extent is of nothing');
    assert.ok([...ids].every((id) => m.classOf(id) !== 'IfcSlab'), 'no slab is drawn');
    assert.ok(bounds.max.x - bounds.min.x < 6 && bounds.max.y - bounds.min.y < 1, JSON.stringify(bounds));
  });

  it('at the default 1.2 m the structural plan draws the slab on the band edge and is framed on it, as drawn', async () => {
    const { bounds, content, ids } = await onSheet('structural', m.levels.length - 1);
    assert.ok([...ids].some((id) => m.classOf(id) === 'IfcSlab'), 'the slab is drawn');
    assert.ok(bounds.max.x - bounds.min.x > 6, JSON.stringify(bounds));
    for (const [a, b] of [[bounds.min.x, content.min.x], [bounds.min.y, content.min.y], [bounds.max.x, content.max.x], [bounds.max.y, content.max.y]]) assert.ok(Math.abs(a - b) < 1e-6, `${JSON.stringify(bounds)} vs ${JSON.stringify(content)}`);
  });
});
