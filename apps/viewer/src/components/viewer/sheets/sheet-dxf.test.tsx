/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PR #130 review: a 3D view printed as a raster exported to DXF as an empty
 * frame with no word said. DXF here carries lines and text only, so the export
 * says which views it left out.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advance, cleanup, render, waitFor } from '@/test/render.js';
import { Toaster } from '@/components/ui/toast';
import { addProjectSheet, addProjectView, resetProject, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { exportSheetDxf } from './sheet-dxf.js';

/** Toasts live in a module-level store: read only the ones shown after `seq`. */
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-toast-seq]')].map((r) => ({ seq: Number(r.dataset.toastSeq), text: r.textContent ?? '' }));
const lastSeq = () => Math.max(-1, ...rows().map((r) => r.seq));
const shownSince = (seq: number) => rows().filter((r) => r.seq > seq).map((r) => r.text).join(' ');

const sheet = () => useProjectStore.getState().sheets[0];

function sheetWith(projection: 'perspective' | 'axonometric'): SVGSVGElement {
  addProjectSheet('Presentation');
  const id = addProjectView({ kind: '3d', name: 'Street view', viewpoint: null, projection, ...(projection === 'axonometric' ? { preset: 'se' as const } : {}) });
  addViewport(sheet().id, id, { x: 100, y: 100 }, 200);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  return svg;
}

describe('a sheet exported as DXF', () => {
  beforeEach(() => resetProject());
  afterEach(() => cleanup());

  it('says a view printed as an image is left out, by name', async () => {
    render(<Toaster />);
    const before = lastSeq();
    exportSheetDxf(sheetWith('perspective'), sheet());
    await waitFor(() => /Street view/.test(shownSince(before)), 'the notice to name the view');
    assert.match(shownSince(before), /DXF has no images: Street view/);
  });

  it('says nothing for an axonometric, which exports as lines', async () => {
    render(<Toaster />);
    const before = lastSeq();
    exportSheetDxf(sheetWith('axonometric'), sheet());
    await advance(50);
    assert.doesNotMatch(shownSince(before), /DXF has no images/);
  });
});
