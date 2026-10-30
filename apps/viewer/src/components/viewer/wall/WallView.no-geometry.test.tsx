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
import { resetProject } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { registerLocale, setLocale } from '@/i18n/registry';
import ro from '@/i18n/locales/ro';
import { WallView } from './WallView';

const MODEL = { id: 'm', name: 'rooms.ifc', visible: true, geometryResult: null } as never;
const publish = (meshes: unknown[] | null) => publishDrawingRuntime({ geometryResult: meshes ? ({ meshes } as unknown as GeometryResult) : null, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false });
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
});
