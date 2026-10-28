/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import type { DraftEntity } from '@/drafting/types';
import { sectionSymbolShapes } from '@/drafting/section-symbol';
import { useSheetContent, type SheetContent } from './useSheetContent.js';

/**
 * #154: a sheet reads a viewport's drafts, cross-references included, for what it draws, the
 * extent it fits and the box it frames, on every render. On a large model placing the marks was
 * the biggest script cost of opening a sheet. The hook hands one input per viewport while nothing
 * it reads changes, so the marks are placed once; a change to the plan's drafts places them again.
 */

const plan: ProjectView = { id: 'p', kind: 'plan', name: 'Ground', createdAt: 0, scale: 100, level: { name: 'Ground', elevation: 0, storeyGlobalIds: [] }, cutHeight: 1.2 };
const BOUNDS = { min: { x: 0, y: 0 }, max: { x: 10, y: 8 } };
const drawing = { lines: [], cutPolygons: [], projectionPolygons: [], bounds: BOUNDS, config: { plane: { axis: 'y', position: 1.2, flipped: false } } } as unknown as Drawing2D;
const vp: SheetViewport = { id: 'vp', viewId: 'p', x: 150, y: 150, scale: 100, width: 0, height: 0, center: null };
const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [vp] };
const line = (id: string, x: number): DraftEntity => ({ id, viewId: 'p', layerId: '0', params: {}, shape: { type: 'line', a: { x, y: 0 }, b: { x, y: 2 } } });

let hook: SheetContent | null = null;
function Harness() {
  hook = useSheetContent(sheet);
  return null;
}

beforeEach(() => resetProject());
afterEach(() => {
  cleanup();
  hook = null;
  useViewDrawings.setState({ byView: {} });
});

describe('a sheet places a viewport\'s cross-references once while nothing changes (#154)', () => {
  it('hands the same drafts to every read of the viewport, and new ones when the plan changes', () => {
    useProjectStore.setState({ views: [plan], sheets: [sheet], drafts: [line('a', 1)] });
    useViewDrawings.setState({ byView: { p: { drawing, status: 'ready', progress: 100, phase: '', error: null } } });
    render(<Harness />);
    assert.ok(hook);
    const first = hook.content(vp).drafts;
    hook.boxOf(vp);
    assert.equal(hook.content(vp).drafts, first, 'the same marks, not placed again');
    assert.deepEqual(first.map((d) => d.id), ['a']);

    act(() => useProjectStore.setState({ drafts: [line('a', 1), line('b', 3)] }));
    const next = hook.content(vp).drafts;
    assert.notEqual(next, first);
    assert.deepEqual(next.map((d) => d.id), ['a', 'b'], 'a draft added to the plan is drawn');
  });

  it('places them once across mounts too: a sheet the Wall hangs as an outline and draws again finds its marks placed', () => {
    // The Wall mounts a sheet's drawing when its zoom takes it over the drawn width and drops it when it falls back under,
    // so a zoom in and out remounts the hook. The marks are in paper millimetres: the zoom is not among what they read.
    useProjectStore.setState({ views: [plan], sheets: [sheet], drafts: [line('a', 1)] });
    useViewDrawings.setState({ byView: { p: { drawing, status: 'ready', progress: 100, phase: '', error: null } } });
    render(<Harness />);
    assert.ok(hook);
    const first = hook.content(vp).drafts;
    cleanup();
    hook = null;
    render(<Harness />);
    assert.ok(hook);
    assert.equal((hook as SheetContent).content(vp).drafts, first, 'the same marks, not placed again');
    act(() => useProjectStore.setState({ drafts: [line('a', 1), line('b', 3)] }));
    assert.notEqual((hook as SheetContent).content(vp).drafts, first, 'but a change to the plan places them again');
  });

  it('keeps a viewport at another scale apart', () => {
    useProjectStore.setState({ views: [plan], sheets: [sheet], drafts: [line('a', 1)] });
    useViewDrawings.setState({ byView: { p: { drawing, status: 'ready', progress: 100, phase: '', error: null } } });
    render(<Harness />);
    assert.ok(hook);
    assert.notEqual(hook.content({ ...vp, scale: 50 }).drafts, hook.content(vp).drafts);
  });

  describe('a mark follows the sheets it refers to', () => {
    const section: ProjectView = { id: 'sec', kind: 'section', name: 'A', createdAt: 0 } as ProjectView;
    const secVp: SheetViewport = { id: 'vsec', viewId: 'sec', x: 0, y: 0, scale: 100, width: 0, height: 0, center: null };
    const symbol: DraftEntity[] = sectionSymbolShapes({ x: 4, y: -1 }, { x: 4, y: 9 }, { x: 6, y: 4 }, 'A', 0.35)
      .map((shape, i) => ({ id: `sym${i}`, viewId: 'p', layerId: '0', shape, params: { sectionOf: 'sec' } }));
    const target = (number: string, viewports: SheetViewport[] = [secVp]): ProjectSheet => ({ ...sheet, id: 't', number, name: 'Sections', viewports });
    const marks = (): string[] => {
      assert.ok(hook);
      return hook.content(vp).drafts.filter((d) => !symbol.some((s) => s.id === d.id) && d.shape.type === 'text').map((d) => (d.shape.type === 'text' ? d.shape.text : ''));
    };
    const open = (target: ProjectSheet) => {
      useProjectStore.setState({ views: [plan, section], sheets: [sheet, target], drafts: symbol });
      useViewDrawings.setState({ byView: { p: { drawing, status: 'ready', progress: 100, phase: '', error: null } } });
      render(<Harness />);
    };

    it('prints the new number when the sheet that carries the section is renumbered', () => {
      open(target('A-301'));
      assert.ok(marks().length > 0 && marks().every((t) => t.includes('A-301')), `marks read A-301: ${marks()}`);
      act(() => useProjectStore.setState({ sheets: [sheet, target('A-302')] }));
      assert.ok(marks().length > 0 && marks().every((t) => t.includes('A-302') && !t.includes('A-301')), `marks read A-302: ${marks()}`);
    });

    it('prints the other sheet\'s number when the section\'s viewport moves to it', () => {
      open(target('A-301'));
      assert.ok(marks().every((t) => t.includes('A-301')));
      const moved: ProjectSheet = { ...target('A-401'), id: 'u' };
      act(() => useProjectStore.setState({ sheets: [sheet, target('A-301', []), moved] }));
      assert.ok(marks().length > 0 && marks().every((t) => t.includes('A-401') && !t.includes('A-301')), `marks read A-401: ${marks()}`);
    });
  });
});
