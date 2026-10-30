/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #603: a valid model with no geometry (rooms and coverings only) finishes loading with no meshes, so no set is ever laid
 * out, and the Wall stayed on "Reading the model…" for ever. Once the load is over it says the model has no geometry.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeometryResult } from '@ifc-lite/geometry';
import { cleanup, render, waitFor } from '@/test/render.js';
import { updateInThisTask } from '@/test/react-tasks.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { isSetSheet } from '@/project/drawing-set';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { WallView } from './WallView';

const MODEL = { id: 'm', name: 'rooms.ifc', visible: true, geometryResult: null } as never;
const publish = (meshes: unknown[] | null) => publishDrawingRuntime({ geometryResult: meshes ? ({ meshes } as unknown as GeometryResult) : null, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false });
const block = () => {
  const [X, Y, Z] = [10, 6, 7];
  const positions = new Float32Array([0, 0, 0, X, 0, 0, X, Y, 0, 0, Y, 0, 0, 0, Z, X, 0, Z, X, Y, Z, 0, Y, Z]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  return { expressId: 1, ifcType: 'IfcWall', positions, normals: new Float32Array(positions.length), indices, color: [0.5, 0.5, 0.5, 1] };
};
const failedModel = (loadError: string | null) => ({ id: 'bad', name: 'broken.ifc', visible: true, geometryResult: null, loadState: 'error', loadError }) as never;
const status = (ui: HTMLElement) => (ui.querySelector('output')?.textContent ?? '').trim();

beforeEach(() => {
  resetProject();
  useViewerStore.setState({ geometryStreamingActive: false, loading: false, models: new Map([['m', MODEL]]) });
});
afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
  setLocale('en');
  useViewerStore.setState({ geometryStreamingActive: false, loading: false, models: new Map() });
});

describe('the Wall on a model without geometry', () => {
  for (const meshes of [[], null] as Array<unknown[] | null>) {
    it(`says so in English once the load is over (meshes: ${meshes === null ? 'none published' : 'empty'})`, async () => {
      act(() => publish(meshes));
      const ui = render(<WallView />);
      await waitFor(() => status(ui).length > 0 && !status(ui).includes('Reading'), 'the no-geometry line');
      assert.equal(status(ui), 'rooms.ifc has no geometry to lay a drawing set out on.');
    });
  }

  it('says so in Romanian', async () => {
    registerLocale('ro', ro);
    setLocale('ro');
    act(() => publish([]));
    const ui = render(<WallView />);
    await waitFor(() => status(ui).includes('nu are geometrie'), 'the Romanian line');
    assert.equal(status(ui), 'rooms.ifc nu are geometrie pe care să se așeze un set de desene.');
  });

  it('keeps reading while the model is still loading or streaming', async () => {
    act(() => publish([]));
    useViewerStore.setState({ loading: true });
    const ui = render(<WallView />);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(status(ui), 'Reading the model…');
    await updateInThisTask(() => useViewerStore.setState({ loading: false, geometryStreamingActive: true }));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(status(ui), 'Reading the model…');
  });

  it('reports a model whose geometry failed, with the reason, and not "no geometry"', async () => {
    useViewerStore.setState({ models: new Map([['bad', failedModel('wasm exploded')]]) });
    act(() => publish([]));
    const ui = render(<WallView />);
    await waitFor(() => status(ui).length > 0 && !status(ui).includes('Reading'), 'the failure line');
    assert.equal(status(ui), 'Could not read the geometry of broken.ifc: wasm exploded');
    assert.ok(!status(ui).includes('no geometry'));
  });

  it('reports a failed model without a reason, in English and in Romanian', async () => {
    useViewerStore.setState({ models: new Map([['bad', failedModel(null)]]) });
    act(() => publish([]));
    const ui = render(<WallView />);
    await waitFor(() => status(ui).includes('broken.ifc'), 'the failure line');
    assert.equal(status(ui), 'Could not read the geometry of broken.ifc.');
    cleanup();
    registerLocale('ro', ro);
    setLocale('ro');
    const roUi = render(<WallView />);
    await waitFor(() => status(roUi).includes('broken.ifc'), 'the Romanian failure line');
    assert.equal(status(roUi), 'Geometria din broken.ifc nu a putut fi citită.');
  });

  it('shows the good model and reports the failed one in a mixed project', async () => {
    useViewerStore.setState({ models: new Map([['m', { ...(MODEL as object), geometryResult: { coordinateInfo: { shiftedBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } } } } } as never], ['bad', failedModel('wasm exploded')]]) });
    act(() => publish([block()]));
    const ui = render(<WallView />);
    await waitFor(() => useProjectStore.getState().sheets.some(isSetSheet), 'the set laid out from the good model');
    const alert = ui.querySelector('[role="alert"]');
    assert.equal(alert?.textContent, 'Could not read the geometry of broken.ifc: wasm exploded');
    assert.ok(!(ui.textContent ?? '').includes('no geometry'));
  });

  it('says "no geometry" for the good model of a mixed project that has none, and still reports the failed one', async () => {
    useViewerStore.setState({ models: new Map([['bad', failedModel('wasm exploded')], ['m', MODEL]]) });
    act(() => publish([]));
    const ui = render(<WallView />);
    await waitFor(() => status(ui).includes('no geometry'), 'the no-geometry line');
    assert.equal(status(ui), 'rooms.ifc has no geometry to lay a drawing set out on.');
    assert.equal(ui.querySelector('[role="alert"]')?.textContent, 'Could not read the geometry of broken.ifc: wasm exploded');
  });
});
