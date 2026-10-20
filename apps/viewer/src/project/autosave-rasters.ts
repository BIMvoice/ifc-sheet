/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the autosave keeps a 3D view's raster capture. A capture is a PNG data
 * URL sized for print (up to 16.7 MP), so a single one can be megabytes, and
 * the autosave slot is one localStorage entry in a quota of about 5 MB for the
 * whole site: kept in the slot, it would fill it and every later autosave of
 * the drawings would fail. The slot keeps the raster's box and pixel size with
 * a reference in place of the image (`autosave-raster:<view id>`); the image
 * goes to the same IndexedDB store as the model state
 * (`autosave-snapshots.ts`), under `<slot>#raster:<view id>`, and is put back
 * after the slot is read. The project file and a package carry the image as
 * it is, base64 in the JSON.
 */

import type { ProjectDocument, ProjectView } from './types';
import { run } from './autosave-snapshots';
import { useProjectStore } from './project-store';

const REF_PREFIX = 'autosave-raster:';

/** Whether a raster's `href` is the autosave slot's reference, not an image. */
export function isAutosaveRasterRef(href: string): boolean {
  return href.startsWith(REF_PREFIX);
}

const keyOf = (slot: string, viewId: string) => `${slot}#raster:${viewId}`;

/** The document as the slot holds it, and the images it left out (view id → data URL). */
export function withoutRasters(doc: ProjectDocument): { slim: ProjectDocument; rasters: Map<string, string> } {
  const rasters = new Map<string, string>();
  const views = doc.views.map((v): ProjectView => {
    if (v.kind !== '3d' || !v.raster || isAutosaveRasterRef(v.raster.href)) return v;
    rasters.set(v.id, v.raster.href);
    return { ...v, raster: { ...v.raster, href: REF_PREFIX + v.id } };
  });
  return { slim: rasters.size > 0 ? { ...doc, views } : doc, rasters };
}

/** What was last written per key, so an unchanged image is not written again on every autosave. */
const written = new Map<string, string>();

/** Keeps each image under the slot; false, with the reason in the console, when the browser would not take one. */
export async function writeRasters(slot: string, rasters: ReadonlyMap<string, string>): Promise<boolean> {
  let ok = true;
  for (const [viewId, href] of rasters) {
    const key = keyOf(slot, viewId);
    if (written.get(key) === href) continue;
    try {
      await run('readwrite', (s) => s.put(href, key));
      written.set(key, href);
    } catch (err) {
      console.warn('[project] a raster capture could not be kept for the autosave', err);
      ok = false;
    }
  }
  return ok;
}

/**
 * Puts the images back into the views the slot restored, while `slot` is still
 * the one in front. A view whose image is gone (site data cleared) is left
 * without a capture, so it asks to be captured again instead of showing a
 * broken image.
 */
export async function restoreRasters(slot: string, current: () => string | null): Promise<void> {
  const refs = useProjectStore.getState().views.filter((v) => v.kind === '3d' && v.raster && isAutosaveRasterRef(v.raster.href));
  if (refs.length === 0) return;
  const found = new Map<string, string | null>();
  for (const v of refs) {
    const key = keyOf(slot, v.id);
    try {
      const href = await run<unknown>('readonly', (s) => s.get(key));
      found.set(v.id, typeof href === 'string' ? href : null);
      if (typeof href === 'string') written.set(key, href);
    } catch (err) {
      console.warn('[project] a kept raster capture could not be read', err);
      found.set(v.id, null);
    }
  }
  if (current() !== slot) return;
  useProjectStore.setState({
    views: useProjectStore.getState().views.map((v) => {
      if (v.kind !== '3d' || !v.raster || !isAutosaveRasterRef(v.raster.href) || !found.has(v.id)) return v;
      const href = found.get(v.id);
      return { ...v, raster: href ? { ...v.raster, href } : null };
    }),
  });
}
