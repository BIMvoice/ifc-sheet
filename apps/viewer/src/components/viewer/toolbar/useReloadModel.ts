/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reload the IFC model (#922) from the screen: the file is re-read from disk through the handle it was opened with
 * (Chromium), else picked again, and handed to `reloadModel` (`whatchanged/reload.ts`) with the viewer's one loader.
 * The ribbon's Refresh of one model, the project drawer's button, RELOADMODEL (`RELOAD_MODEL_EVENT`) and a new version
 * opened or dropped on the loaded model (`offerReload`) all end here.
 */

import { useCallback, useEffect } from 'react';
import { useViewerStore } from '@/store';
import type { useIfcLoader } from '@/hooks/useIfcLoader';
import { resolve } from '@/i18n/registry';
import { toast } from '@/components/ui/toast';
import { recordRecentFiles, cacheFileBlobs } from '@/lib/recent-files';
import { openIfcFilesWithHandles, readFreshFile, supportsFileSystemAccess } from '@/services/file-system-access';
import { captureModelTags, restoreModelTags } from '@/lib/model-tags/carry-over';
import { askInDialog, openFileForProject } from '@/project/open-file';
import { RELOAD_MODEL_EVENT } from '@/whatchanged/reload-event';
import { setPanel } from '../wall/wall-nav';

type LoadFile = ReturnType<typeof useIfcLoader>['loadFile'];

/** The saved file picked again, when there is no handle to re-read it through. Null when the person cancels. */
async function pickAgain(): Promise<{ file: File; handle?: FileSystemFileHandle } | null> {
  if (supportsFileSystemAccess()) {
    const opened = await openIfcFilesWithHandles();
    return opened?.[0] ?? null;
  }
  return new Promise((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ifc';
    input.addEventListener('change', () => done(input.files?.[0] ? { file: input.files[0] } : null));
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

/**
 * One reload at a time. `useFileCommands` is mounted by both the ribbon and the IfcSheet shell, so each event reaches
 * two listeners; the first takes it, synchronously, and the second finds this set.
 */
let reloading = false;

/** Mounted with `useFileCommands`: returns the reload, and answers `RELOAD_MODEL_EVENT`. */
export function useReloadModel(loadFile: LoadFile): () => Promise<void> {
  const reload = useCallback(async () => {
    if (reloading) return;
    reloading = true;
    try {
      await reloadWith(loadFile);
    } finally {
      reloading = false;
    }
  }, [loadFile]);

  useEffect(() => {
    const handler = () => { void reload(); };
    window.addEventListener(RELOAD_MODEL_EVENT, handler);
    return () => window.removeEventListener(RELOAD_MODEL_EVENT, handler);
  }, [reload]);

  return reload;
}

async function reloadWith(loadFile: LoadFile): Promise<void> {
  const { reloadRefusal } = await import('@/whatchanged/reload');
  const refused = reloadRefusal();
  if (refused) { toast.error(refused); return; }
  const [model] = useViewerStore.getState().models.values();
  const reread = model.sourceHandle ? await readFreshFile(model.sourceHandle) : null;
  const picked = reread ? { file: reread, handle: model.sourceHandle } : await pickAgain();
  if (picked) await reloadFileAndSay(picked.file, picked.handle, loadFile);
}

/** `file` replaces the one loaded model with the project kept, and the notice says what changed; a failure is said, not thrown. */
async function reloadFileAndSay(file: File, handle: FileSystemFileHandle | undefined, loadFile: LoadFile): Promise<void> {
  const { reloadModel, reloadNotice } = await import('@/whatchanged/reload');
  const [model] = useViewerStore.getState().models.values();
  // Model tags die with the model; an explicit reload keeps them (#4215).
  const carry = captureModelTags(useViewerStore.getState());
  recordRecentFiles([{ name: file.name, size: file.size }]);
  void cacheFileBlobs([file]);
  try {
    const outcome = await reloadModel(file, (f) => loadFile(f, { kind: 'primary' }, { sourceHandle: handle }));
    const reloadedId = useViewerStore.getState().activeModelId;
    if (model && reloadedId) restoreModelTags(useViewerStore.getState(), carry, model.id, reloadedId);
    toast.success(reloadNotice(outcome, file.name), { label: resolve('modelReload.show'), onClick: () => setPanel('changed') });
  } catch (err: unknown) {
    console.warn('[ifcsheet] the model could not be reloaded', err);
    toast.error(resolve('modelReload.failed', { reason: err instanceof Error ? err.message : String(err) }));
  }
}

/**
 * One file opened or dropped while a model is loaded: when it is the next version of that model (`openFileForProject`:
 * the same IfcProject GlobalId) it is offered as a reload with the project kept; declined, or any other file, `otherwise`.
 */
export function offerReload(file: File, handle: FileSystemFileHandle | undefined, loadFile: LoadFile, otherwise: (file: File) => void | Promise<void>): Promise<void> {
  return openFileForProject(file, {
    models: () => Array.from(useViewerStore.getState().models.values()),
    ask: askInDialog,
    open: otherwise,
    update: (f) => reloadFileAndSay(f, handle, loadFile),
    updated: () => {},
    failed: (reason) => toast.error(resolve('whatchanged.offer.failed', { reason })),
  });
}
