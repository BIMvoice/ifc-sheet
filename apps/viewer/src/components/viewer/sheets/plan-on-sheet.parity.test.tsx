/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan placed on a sheet draws the same lines as the open plan (#189). Both are styled by the view's one styler (`viewStyler`), so
 * what a view says about single lines of the model (one hidden, one in another pen, #33 and #189) must show on the paper exactly as
 * it shows in the drafting view. AC20-FZK-Haus's ground floor through the real pipeline, with one projected line hidden and another
 * drawn heavy, red and dashed: the open plan's canvas styler and the real `SheetPaper` give every pen the same number of lines.
 */

import '@/test/setup-dom.js';
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { hiddenLineEntry } from '@bimvoice/ifcsheet';
import { cleanup, render } from '@/test/render.js';
import { useViewCanvasStyler } from '@/components/viewer/drafting/useViewCanvasStyler';
import type { CanvasStyler } from '@/components/viewer/drawing/canvas-item-style';
import { FZK_HAUS, loadPlanModel, planModelMissing, type LoadedPlanModel } from '@/test/discipline-plan-fixture';
import { renderIdGlobalId } from '@/project/element-guid';
import { planViewFor } from '@/project/view-defaults';
import { resetProject } from '@/project/project-store';
import type { StyledDrawing } from '@/project/view-graphics';
import type { ProjectSheet, ProjectView, SheetViewport, ViewGraphics } from '@/project/types';
import { SheetPaper } from './SheetPaper';

/** The open plan's canvas styler, built through the hook the drafting view uses. */
function canvasStylerOf(graphics: ViewGraphics, drawing: Drawing2D): CanvasStyler {
  let styler: CanvasStyler | null = null;
  function Probe() {
    styler = useViewCanvasStyler(graphics, drawing);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  act(() => root.unmount());
  assert.ok(styler);
  return styler;
}

type Counts = Map<string, number>;
const bump = (counts: Counts, key: string, by = 1) => counts.set(key, (counts.get(key) ?? 0) + by);
const key = (stroke: string | null, dash: string, weight: number) => `${(stroke ?? '').toLowerCase()}|${dash}|${weight}`;

describe('a plan on a sheet draws the same lines as the open plan (#189)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let model: LoadedPlanModel;
  let view: ProjectView;
  let plain: ProjectView;
  let hidden: DrawingLine;
  let restyled: DrawingLine;

  const gidOf = (l: DrawingLine) => renderIdGlobalId(l.entityId)!;
  const ends = (l: DrawingLine) => ({ start: l.line.start, end: l.line.end });
  const isSeen = (l: DrawingLine) => l.category === 'projection' && l.visibility === 'visible' && !!renderIdGlobalId(l.entityId);

  before(async () => {
    model = await loadPlanModel(FZK_HAUS);
    const level = model.levels.find((l) => l.name === 'Erdgeschoss')!;
    plain = { ...planViewFor(level, []), createdAt: 0, id: 'v-ground' } as ProjectView;
    const raw = await model.planOf(plain, { omits: 'none' });
    const seen = raw.lines.filter(isSeen);
    assert.ok(seen.length > 20, 'the plan has projected lines to pick from');
    [hidden, restyled] = [seen[0], seen[Math.floor(seen.length / 2)]];
    assert.notEqual(hiddenLineEntry(gidOf(hidden), ends(hidden)), hiddenLineEntry(gidOf(restyled), ends(restyled)), 'two different lines');
    const graphics: ViewGraphics = {
      hiddenLines: [hiddenLineEntry(gidOf(hidden), ends(hidden))],
      lineStyles: { [hiddenLineEntry(gidOf(restyled), ends(restyled))]: { weight: 'heavy', type: 'dashed', color: '#cc0000' } },
    };
    view = { ...plain, graphics };
  });

  afterEach(() => cleanup());
  after(() => resetProject());

  it('the hidden line and the restyled line are in the drawing as the view says', async () => {
    const shown = await model.planOf(view, { omits: 'none' });
    const unmarked = await model.planOf(plain, { omits: 'none' });
    assert.equal(shown.lines.length, unmarked.lines.length - 1, 'one line fewer: the hidden one');
    assert.ok(!shown.lines.some((l) => l.entityId === hidden.entityId && l.line.start.x === hidden.line.start.x && l.line.start.y === hidden.line.start.y && l.line.end.x === hidden.line.end.x && l.line.end.y === hidden.line.end.y));
  });

  it('every pen has the same number of lines on the open plan and on the sheet', async () => {
    const shown = (await model.planOf(view, { omits: 'none' })) as StyledDrawing;
    const canvas = canvasStylerOf(view.graphics!, shown);
    const open: Counts = new Map();
    for (const l of shown.lines as DrawingLine[]) {
      const s = canvas.line(l);
      if (s) bump(open, key(s.stroke, s.dash.join(' '), s.weight));
    }
    const vp: SheetViewport = { id: 'a', viewId: view.id, x: 600, y: 400, scale: 100, width: 1100, height: 700, center: null };
    const sheet = { id: 's', number: 'A-101', name: 'Plan', createdAt: 0, paper: 'A0', orientation: 'landscape', titleBlock: {}, viewports: [vp] } as unknown as ProjectSheet;
    const ui = render(<SheetPaper sheet={sheet} projectName="FZK" layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} content={() => ({ view, drawing: shown, drafts: [] })} />);
    const onSheet: Counts = new Map();
    // The cut outline is a cut face's stroke, which the canvas draws with the face: compare the lines it draws as lines.
    for (const p of ui.querySelectorAll('[data-viewport-id="a"] path')) {
      const layer = p.getAttribute('data-dxf-layer');
      if (layer === 'CUT' || p.getAttribute('fill') !== 'none' || p.getAttribute('stroke') === 'none') continue;
      if (layer === 'HATCH' || layer === 'SURFACE') continue;
      const dash = (p.getAttribute('stroke-dasharray') ?? '').trim();
      bump(onSheet, key(p.getAttribute('stroke'), dash, Number(p.getAttribute('stroke-width'))), (p.getAttribute('d')?.match(/M/g) ?? []).length);
    }
    assert.ok(open.size > 1, 'the plan has more than one pen');
    assert.deepEqual([...onSheet].sort(), [...open].sort());
    const red = [...open].filter(([k]) => k.startsWith('#cc0000|'));
    assert.deepEqual(red.map(([, n]) => n), [1], 'the restyled line is the one line in its own pen, on both');
    assert.ok(red[0][0].split('|')[1] !== '', 'and it is dashed');
  });
});
