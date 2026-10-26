/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render, waitFor, advance } from '@/test/render.js';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { currentFindings } from '@/check/collect';
import { FINDING_INPUTS } from '@/check/inputs';
import { FINDINGS_DEBOUNCE_MS } from '@/check/watch-findings';
import type { FindingNav } from '@/check/go';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { useViewDrawings, EMPTY_VIEW_DRAWING } from '@/project/view-drawings';
import type { PlanProjectView } from '@/project/types';
import type { DraftEntity } from '@/drafting/types';
import { useViewerStore } from '@/store';
import { WALL_SKIN } from './set-skin';
import { FindingList } from './FindingList';
import { SheetPanel } from './SheetPanel';

/**
 * #24: the list of what is missing follows the set. The model is the real AC20-FZK-Haus, its ground-floor plan drawn by the
 * real pipeline and put on a sheet; the list is the real `FindingList`. Nothing here presses Refresh.
 */

const nav: FindingNav = { open: () => false };
const SETTLE = FINDINGS_DEBOUNCE_MS + 150;

describe('the list of what is missing follows the set (#24)', { skip: planModelMissing(FZK_HAUS) }, () => {
  let viewId = '';
  let guids: string[] = [];

  const tag = (guid: string): DraftEntity => ({
    id: `tag-${guid}`, viewId, layerId: '0', shape: { type: 'text', p: { x: 0, y: 0 }, text: 'D', height: 0.25 } as never, params: { tagOf: guid },
  });
  const untaggedDoors = () => currentFindings().filter((f) => f.kind === 'untaggedOpenings' && f.params.what === 'door').flatMap((f) => f.guids ?? []);

  before(async () => {
    const loaded = await loadPlanModel(FZK_HAUS);
    resetProject();
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    const ground = [...loaded.levels].sort((a, b) => a.elevation - b.elevation)[0]!;
    useProjectStore.setState({ levels: [ground] });
    const view: PlanProjectView = { id: 'plan', kind: 'plan', name: 'Ground floor', createdAt: 0, scale: 100, level: ground, cutHeight: 1.2 };
    viewId = view.id;
    const drawing = await loaded.planOf(view, { omits: 'none' });
    useProjectStore.setState({ views: [view] });
    useViewDrawings.setState({ byView: { [viewId]: { ...EMPTY_VIEW_DRAWING, status: 'ready', drawing } } });
    const { models } = useViewerStore.getState();
    publishDrawingRuntime({ geometryResult: [...models.values()][0]!.geometryResult as never, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    useProjectStore.setState({ drafts: [], sheets: sheets() });
    guids = untaggedDoors();
    assert.ok(guids.length >= 2, 'the plan shows doors');
  });

  const sheets = () => [{ id: 's1', number: 'A-101', name: 'Ground floor', createdAt: 0, viewports: [{ id: 'vp', viewId, x: 0, y: 0, scale: 100, width: 0, height: 0, center: null }] }] as never;
  beforeEach(() => {
    useProjectStore.setState({ drafts: guids.slice(0, -1).map(tag), name: 'FZK', titleBlock: { project: 'FZK', drawnBy: 'PC', date: '2026-10-26' }, sheets: sheets() });
  });
  afterEach(() => cleanup());

  const text = (ui: HTMLElement) => ui.textContent ?? '';
  /** Counts how often the checks read the project name, which only `collectInput` reads: one read is one recompute. */
  const countRecomputes = () => {
    const real = useProjectStore.getState;
    let n = 0;
    useProjectStore.getState = (() => new Proxy(real(), { get: (t, k, r) => { if (k === 'name') n++; return Reflect.get(t, k, r); } })) as never;
    return { count: () => n, stop: () => { useProjectStore.getState = real; } };
  };

  it('tagging the last untagged door removes its finding without a refresh', async () => {
    const ui = render(<FindingList nav={nav} skin={WALL_SKIN} readOnMount />);
    assert.deepEqual(untaggedDoors(), [guids.at(-1)]);
    assert.match(text(ui), /door/i, 'the list names the untagged door');
    const before = text(ui);
    act(() => { useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, tag(guids.at(-1)!)] }); });
    await waitFor(() => text(ui) !== before, 'the list changed');
    assert.deepEqual(untaggedDoors(), []);
    assert.doesNotMatch(text(ui), /door/i, 'the finding about doors is gone');
  });

  it('the sheet panel lists what is missing as it opens, and keeps it current, without a Refresh', async () => {
    const sheet = useProjectStore.getState().sheets[0]!;
    const noop = () => {};
    const ui = render(<SheetPanel sheet={sheet} viewport={null} box={null} viewportName="" onExportSvg={noop} onExportDxf={noop} onPrint={noop} />);
    assert.match(text(ui), /door/i, 'listed on mount');
    const before = text(ui);
    act(() => { useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, tag(guids.at(-1)!)] }); });
    await waitFor(() => text(ui) !== before, 'the list changed');
    assert.doesNotMatch(text(ui), /door/i, 'the door finding is gone');
  });

  it('clearing a title-block field adds a finding', async () => {
    const ui = render(<FindingList nav={nav} skin={WALL_SKIN} readOnMount />);
    assert.equal(currentFindings().some((f) => f.kind === 'titleBlockEmpty' && f.params.field === 'drawnBy'), false, 'drawn-by is filled');
    const before = text(ui);
    act(() => { useProjectStore.setState({ titleBlock: { project: 'FZK', drawnBy: '', date: '2026-10-26' } }); });
    await waitFor(() => text(ui) !== before, 'the list changed');
    assert.equal(currentFindings().some((f) => f.kind === 'titleBlockEmpty' && f.params.field === 'drawnBy'), true);
  });

  it('a change to the loaded models recomputes it', async () => {
    render(<FindingList nav={nav} skin={WALL_SKIN} readOnMount />);
    const spy = countRecomputes();
    try {
      const reads = spy.count();
      act(() => { useViewerStore.setState({ models: new Map(useViewerStore.getState().models) }); });
      await advance(SETTLE);
      assert.equal(spy.count() - reads, 1, 'one recompute for the models changing');
    } finally { spy.stop(); }
  });

  it('a burst of edits is one recompute, and the camera and a panel toggle are none', async () => {
    render(<FindingList nav={nav} skin={WALL_SKIN} readOnMount />);
    const spy = countRecomputes();
    try {
      const start = spy.count();
      act(() => {
        useViewerStore.setState({ hiddenEntities: new Set([1]), sectionPlane: { ...useViewerStore.getState().sectionPlane, enabled: true } } as never);
        useViewerStore.setState({ leftPanelCollapsed: !useViewerStore.getState().leftPanelCollapsed } as never);
        useProjectStore.setState({ activeSheetId: 'other' } as never);
      });
      await advance(SETTLE);
      assert.equal(spy.count(), start, 'nothing the checks read changed');
      act(() => {
        for (const g of guids.slice(-2)) useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, tag(g)] });
      });
      await advance(SETTLE);
      assert.equal(spy.count() - start, 1, 'two edits, one recompute');
    } finally { spy.stop(); }
  });

  it('reads nothing the declared inputs do not list', () => {
    const seen = { project: new Set<string>(), viewDrawings: new Set<string>(), viewer: new Set<string>() };
    const real = [useProjectStore.getState, useViewDrawings.getState, useViewerStore.getState] as const;
    const spyOn = (store: { getState: () => object }, into: Set<string>) => {
      const g = store.getState;
      store.getState = (() => new Proxy(g(), { get: (t, k, r) => { if (typeof k === 'string') into.add(k); return Reflect.get(t, k, r); } })) as never;
    };
    // A dangling tag so the name of a gone element is read from the recorded state too.
    useProjectStore.setState({ drafts: [...useProjectStore.getState().drafts, { ...tag('GONE000000000000000000'), id: 'gone' }] });
    spyOn(useProjectStore, seen.project); spyOn(useViewDrawings, seen.viewDrawings); spyOn(useViewerStore, seen.viewer);
    try { currentFindings(); } finally { Object.assign(useProjectStore, { getState: real[0] }); Object.assign(useViewDrawings, { getState: real[1] }); Object.assign(useViewerStore, { getState: real[2] }); }
    const undeclared = (name: keyof typeof seen) => [...seen[name]].filter((k) => !(FINDING_INPUTS[name] as readonly string[]).includes(k));
    assert.deepEqual(undeclared('project'), [], 'project store keys the checks read must be in FINDING_INPUTS.project');
    assert.deepEqual(undeclared('viewDrawings'), []);
    assert.deepEqual(undeclared('viewer'), []);
    assert.ok(seen.project.has('drafts') && seen.viewer.has('models'), 'the spy saw the reads');
  });
});
