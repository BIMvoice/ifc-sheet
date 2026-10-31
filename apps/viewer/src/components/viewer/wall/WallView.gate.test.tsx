/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #618: the real `WallView` lays no set out while a visible model's data store is not in, and lays it out on the
 * building once it is. `wallExtent` is tested by the parity test; this is the line that proves the Wall uses it.
 */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { FZK_HAUS, loadPlanModel, planModelMissing } from '@/test/discipline-plan-fixture';
import { useViewerStore } from '@/store';
import { modelLevels } from '@/project/model-levels';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { isSetSheet } from '@/project/drawing-set';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { WallView } from './WallView';

afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });

describe('WallView waits for the data store before it lays the set out', { skip: planModelMissing(FZK_HAUS) }, () => {
  it('draws nothing while the store is out, then the set on the building (A3) once it is in', async () => {
    await loadPlanModel(FZK_HAUS);
    resetProject();
    const { models } = useViewerStore.getState();
    const [[id, loaded]] = [...models.entries()];
    act(() => useViewerStore.setState({ models: new Map([[id, { ...loaded, ifcDataStore: null, loadState: 'hydrating-metadata' }]]) } as never));
    publishDrawingRuntime({ geometryResult: loaded.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    render(<WallView />);
    await settle();
    assert.equal(useProjectStore.getState().sheets.filter(isSetSheet).length, 0, 'no set is laid out without the data store');

    act(() => {
      useViewerStore.setState({ models } as never);
      syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    });
    await settle();
    const sheets = useProjectStore.getState().sheets.filter(isSetSheet);
    assert.ok(sheets.length > 0, 'the set is laid out once the data store is in');
    assert.ok(sheets.every((s) => s.paper === 'A3'), `FZK-Haus is on A3, got ${sheets.map((s) => s.paper).join(',')}`);
  });

  it('does not hang on a model that finished loading with no data store: it is measured as it is', async () => {
    await loadPlanModel(FZK_HAUS);
    resetProject();
    const [[id, loaded]] = [...useViewerStore.getState().models.entries()];
    act(() => useViewerStore.setState({ models: new Map([[id, { ...loaded, ifcDataStore: null, loadState: 'complete' }]]) } as never));
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    publishDrawingRuntime({ geometryResult: loaded.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    render(<WallView />);
    await settle();
    assert.ok(useProjectStore.getState().sheets.some(isSetSheet), 'a set is laid out');
  });

  it('keeps the paper and scale of a set already saved', async () => {
    await loadPlanModel(FZK_HAUS);
    resetProject();
    const { models } = useViewerStore.getState();
    const [[, loaded]] = [...models.entries()];
    syncProjectWithModels([{ key: 'm', name: 'm' }], modelLevels('m'));
    publishDrawingRuntime({ geometryResult: loaded.geometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => {}, isRegenerating: false });
    render(<WallView />);
    await settle();
    const first = useProjectStore.getState().sheets.filter(isSetSheet);
    assert.ok(first.length > 0);
    useProjectStore.setState({ sheets: first.map((s) => ({ ...s, paper: 'A1' })) });
    await settle();
    assert.ok(useProjectStore.getState().sheets.filter(isSetSheet).every((s) => s.paper === 'A1'), 'a set on the project is never laid out again');
  });
});
