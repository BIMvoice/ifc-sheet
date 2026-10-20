/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PR #130 review: a raster capture (megabytes of PNG data URL) kept in the
 * localStorage autosave slot filled the quota and every later autosave of the
 * drawings failed with only a console line. The slot keeps a reference, the
 * image goes to IndexedDB and comes back, and a refused write is said.
 */

import '@/test/setup-dom.js';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, waitFor } from '@/test/render.js';
import { latestToast } from '@/test/toasts.js';
import { Toaster } from '@/components/ui/toast';
import { addProjectView, projectDocument, resetProject, useProjectStore } from './project-store.js';
import { readAutosave, writeAutosave } from './recovery.js';
import { restoreRasters } from './autosave-rasters.js';
import { projectFingerprint } from './project-saved.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import type { ThreeDProjectView } from './types';

/** A data URL the size of a real print capture: a 150 x 100 mm box at 300 dpi compresses to a few MB of PNG. */
const BIG = `data:image/png;base64,${'A'.repeat(6_000_000)}`;
const KEY = 'ifc-lite:project:v1:test-raster';
/** The slot once another model joins the set. */
const OTHER = 'ifc-lite:project:v1:test-raster|another-model';

function placeRaster(): string {
  return addProjectView({ kind: '3d', name: 'Perspective', viewpoint: null, projection: 'perspective', raster: { href: BIG, widthPx: 1772, heightPx: 1182, widthMm: 150, heightMm: 100 } });
}
const raster = (id: string) => (useProjectStore.getState().views.find((v) => v.id === id) as ThreeDProjectView).raster;

describe('the autosave of a project with a raster capture', () => {
  beforeEach(() => { resetProject(); localStorage.clear(); });
  afterEach(() => cleanup());

  it('keeps the slot small, and the capture comes back from IndexedDB', async () => {
    const id = placeRaster();
    assert.ok(serializeProject(projectDocument()).length > 6_000_000, 'the project file carries the image');
    await writeAutosave(KEY, projectDocument());
    const slot = localStorage.getItem(KEY);
    assert.ok(slot, 'the slot was written');
    assert.ok(slot.length < 20_000, `the slot is small: ${slot.length}`);

    resetProject();
    useProjectStore.setState(parseProjectFile(slot));
    assert.ok(readAutosave(KEY), 'the slot reads back as a project');
    assert.notEqual(raster(id)?.href, BIG, 'the slot alone has only the reference');
    await restoreRasters(KEY);
    assert.equal(raster(id)?.href, BIG);
    assert.deepEqual([raster(id)?.widthMm, raster(id)?.heightMm], [150, 100]);
  });

  it('leaves a view without a capture when its image is gone, so it asks for one', async () => {
    const id = placeRaster();
    await writeAutosave(KEY, projectDocument());
    useProjectStore.setState(parseProjectFile(localStorage.getItem(KEY)!));
    await restoreRasters('ifc-lite:project:v1:another-slot');
    assert.equal(raster(id), null);
  });

  it('keeps the capture when the slot changes while the image is being read back', async () => {
    const id = placeRaster();
    await writeAutosave(KEY, projectDocument());
    useProjectStore.setState(parseProjectFile(localStorage.getItem(KEY)!));
    // A model joins the set while the image is read: the slot in front becomes another one.
    await restoreRasters(KEY);
    // The next autosave goes to the new slot; the capture must go with it.
    await writeAutosave(OTHER, projectDocument());
    resetProject();
    useProjectStore.setState(parseProjectFile(localStorage.getItem(OTHER)!));
    await restoreRasters(OTHER);
    assert.equal(raster(id)?.href === BIG, true, `the capture came back under the new slot: ${raster(id)?.href.slice(0, 40) ?? 'null'}`);
  });

  it('fills only views that still hold their own reference: a capture taken meanwhile, or another project, is left alone', async () => {
    const id = placeRaster();
    await writeAutosave(KEY, projectDocument());
    useProjectStore.setState(parseProjectFile(localStorage.getItem(KEY)!));
    const FRESH = 'data:image/png;base64,ZnJlc2g=';
    const restoring = restoreRasters(KEY);
    // While the image is read back, the person captures the view again.
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === id && v.kind === '3d' && v.raster ? { ...v, raster: { ...v.raster, href: FRESH } } : v)) });
    await restoring;
    assert.equal(raster(id)?.href, FRESH, 'the new capture stays');

    // Another project comes in front while the image is read back: its own reference is not touched.
    useProjectStore.setState(parseProjectFile(localStorage.getItem(KEY)!));
    const again = restoreRasters(KEY);
    resetProject();
    const other = addProjectView({ kind: '3d', name: 'Other', viewpoint: null, projection: 'perspective' });
    const otherRef = `autosave-raster:${other}`;
    useProjectStore.setState({ views: useProjectStore.getState().views.map((v) => (v.id === other ? { ...v, raster: { href: otherRef, widthPx: 10, heightPx: 10, widthMm: 10, heightMm: 10 } } : v)) });
    await again;
    assert.equal(raster(other)?.href, otherRef, 'the other project keeps its reference for its own restore');
  });

  it('fingerprints the slot like the project file it came from, so a saved project is not offered back as unsaved work', async () => {
    placeRaster();
    const file = projectDocument();
    await writeAutosave(KEY, file);
    const slot = parseProjectFile(localStorage.getItem(KEY)!);
    assert.equal(projectFingerprint(slot), projectFingerprint(parseProjectFile(serializeProject(file))));
  });

  it('tells the person when the browser refuses the slot', async () => {
    const ui = render(<Toaster />);
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const full = { getItem: () => null, removeItem: () => {}, setItem: () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); } };
    Object.defineProperty(globalThis, 'localStorage', { value: full, configurable: true });
    try {
      await writeAutosave(KEY, projectDocument());
    } finally {
      if (real) Object.defineProperty(globalThis, 'localStorage', real);
    }
    await waitFor(() => latestToast(ui.ownerDocument.body) !== '', 'a notice to show');
    assert.match(latestToast(ui.ownerDocument.body), /not being autosaved.*quota has been exceeded/);
  });
});
