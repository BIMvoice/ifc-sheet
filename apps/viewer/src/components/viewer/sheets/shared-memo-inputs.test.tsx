/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { SheetPaper, type ViewportContent } from './SheetPaper';
import { useSheetContent, type SheetContent } from './useSheetContent';

/**
 * The Wall, the sheet editor and its preview share what they compute for a
 * drawing (`shared-memo.ts`, #154), keyed by the drawing object. Everything
 * else the result depends on is a part of the memo's key: a view whose
 * graphics changed, or a viewport that moved or was rescaled, must not be
 * answered from what the same drawing was given before.
 */

const view: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, scale: 100, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const BOUNDS = { min: { x: 0, y: 0 }, max: { x: 10, y: 8 } };

/** A fresh drawing (a new object, so no earlier test's memo entry answers for it): a wall's cut and a wall line. */
function wallDrawing(): Drawing2D {
  const outer = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 0, y: 1 }];
  return {
    lines: [{ line: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }, category: 'cut', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', depth: 0 }],
    cutPolygons: [{ polygon: { outer, holes: [] }, entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true }],
    projectionPolygons: [], bounds: BOUNDS, config: { plane: { axis: 'y', position: 1.2, flipped: false } },
  } as unknown as Drawing2D;
}

/** One list for every mount: the memo compares its inputs by identity, as the Wall's sheets share one parsed pattern list. */
const NO_PATTERNS: never[] = [];

const vpAt = (x: number, scale = 100): SheetViewport => ({ id: 'vp', viewId: 'p', x, y: 150, scale, width: 0, height: 0, center: null });
const sheetOf = (vp: SheetViewport): ProjectSheet => ({ id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] });

beforeEach(() => resetProject());
afterEach(() => {
  cleanup();
  useViewDrawings.setState({ byView: {} });
});

describe('a drawing\'s styled form is shared, but not across a change of its view\'s graphics', () => {
  let hook: SheetContent | null = null;
  function Harness({ sheet }: { sheet: ProjectSheet }) {
    hook = useSheetContent(sheet);
    return null;
  }

  it('hiding the walls in the view takes them out of the same drawing', () => {
    const raw = wallDrawing();
    const vp = vpAt(150);
    const sheet = sheetOf(vp);
    useProjectStore.setState({ views: [view], sheets: [sheet], drafts: [] });
    useViewDrawings.setState({ byView: { p: { drawing: raw, status: 'ready', progress: 100, phase: '', error: null } } });
    render(<Harness sheet={sheet} />);
    assert.equal(hook!.content(vp).drawing?.cutPolygons.length, 1, 'the wall is cut');
    act(() => useProjectStore.setState({ views: [{ ...view, graphics: { categories: { walls: { visible: false } } } }] }));
    assert.equal(hook!.content(vp).drawing?.cutPolygons.length, 0, 'the wall is hidden by the view\'s graphics');
  });
});

describe('a drawing\'s pens are shared, but not across a viewport that moved or was rescaled', () => {
  const pensOf = (container: HTMLElement) => [...container.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter((d): d is string => !!d && d.startsWith('M') && d.length < 400).sort();

  function mount(raw: Drawing2D, vp: SheetViewport): string[] {
    const content = (): ViewportContent => ({ view, drawing: raw, drafts: [] });
    const ui = render(<SheetPaper sheet={sheetOf(vp)} projectName="House" content={content} layers={[]} extraPatterns={NO_PATTERNS} selectedViewportId={null} pxPerMm={1} />);
    return pensOf(ui);
  }

  for (const [name, a, b] of [['moved', vpAt(150), vpAt(250)], ['rescaled', vpAt(150, 100), vpAt(150, 50)]] as const) {
    it(`the same drawing on a viewport ${name} is penned for where it is now`, () => {
      const raw = wallDrawing();
      const first = mount(raw, a);
      assert.ok(first.length > 0, 'the drawing is penned');
      cleanup();
      const second = mount(raw, b);
      assert.notDeepEqual(second, first, `the pens follow the ${name} viewport`);
    });
  }
});
