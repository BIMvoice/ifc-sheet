/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The session on offer (`recovery.ts` keeps it in its own slot): held here from the models loading
 * until the user answers. Nothing short of an answer ends it: hanging the set, editing, or closing
 * the page leaves it on offer, on the intro screen and in the project drawer, at the next start too.
 * Restoring goes through `loadProjectDocument`, as opening a file does, and is a swap: the project
 * in front is first written to the recoverable slot and put on offer in its place, so work done after
 * the crash is never lost to a Restore, and restoring again brings it back.
 */

import { create } from 'zustand';
import { deleteRasters, restoreRasters } from './autosave-rasters';
import { deleteModelState, readModelState, withoutModelState, writeModelState } from './autosave-snapshots';
import { toast } from '@/components/ui/toast';
import { resolve } from '@/i18n/registry';
import { serializeProject } from './project-file';
import { loadProjectDocument, projectDocument, useProjectStore } from './project-store';
import { safeStorage } from './project-saved';
import { dropRecoverable, recoverableKey } from './recovery';
import type { ProjectDocument } from './types';

export interface RecoveryOffer {
  /** The autosave slot of the models it belongs to. */
  key: string;
  doc: ProjectDocument;
  /** Epoch milliseconds the autosave was written. */
  savedAt: number;
  modelName: string;
}

export const useRecoveryStore = create<{ offer: RecoveryOffer | null }>()(() => ({ offer: null }));

export function offerRecovery(offer: RecoveryOffer): void {
  useRecoveryStore.setState({ offer });
}

/** Other models are in front: their offer, if any, is theirs. The kept session stays where it is. */
export function forgetRecoveryOffer(): void {
  if (useRecoveryStore.getState().offer) useRecoveryStore.setState({ offer: null });
}

/** The user answered Discard: the kept session is removed. */
export function discardRecovery(storage?: Pick<Storage, 'removeItem'>): void {
  const { offer } = useRecoveryStore.getState();
  if (!offer) return;
  useRecoveryStore.setState({ offer: null });
  dropRecoverable(offer.key, storage);
  void deleteModelState(recoverableKey(offer.key));
  void deleteRasters(recoverableKey(offer.key), offer.doc);
}

/** Puts the model state kept under `stateKey` into the project, if slot `key` is still the one in front and the project has none. */
export async function restoreModelState(key: string, current: () => string | null, stateKey: string = key): Promise<void> {
  const kept = await readModelState(stateKey);
  if (kept && current() === key && !useProjectStore.getState().modelState) useProjectStore.setState({ modelState: kept });
}

/**
 * Puts the offered session in place, as work not yet saved to a file. The project it replaces takes
 * its slot and its place on offer, written at `now`. When that copy cannot be written, nothing is
 * loaded: the person is told, and the project in front stays.
 */
export function restoreRecovery(storage: Pick<Storage, 'setItem'> | undefined = safeStorage(), now = new Date()): void {
  const { offer } = useRecoveryStore.getState();
  if (!offer) return;
  const stateKey = recoverableKey(offer.key);
  const { slim, modelState: replacedState } = withoutModelState(projectDocument());
  try {
    if (!storage) throw new Error('localStorage is not available');
    storage.setItem(stateKey, serializeProject(slim, now));
  } catch (err) {
    console.warn('[project] could not keep the project in front before restoring; not restoring', err);
    toast.error(resolve('wall.recovery.notKept', { detail: err instanceof Error ? err.message : String(err) }));
    return;
  }
  loadProjectDocument(offer.doc, { dirty: true });
  // The offered session's captures come from the recoverable copy, not the live slot the new session has been autosaving to.
  const offered = offer.doc;
  void restoreRasters(offer.key, stateKey).then(() => deleteRasters(stateKey, offered));
  useRecoveryStore.setState({ offer: { ...offer, doc: slim, savedAt: now.getTime() } });
  // The offered session's state is read before the replaced project's is written over it.
  void readModelState(stateKey).then(async (kept) => {
    if (replacedState) await writeModelState(stateKey, replacedState);
    else await deleteModelState(stateKey);
    if (kept && !useProjectStore.getState().modelState) useProjectStore.setState({ modelState: kept });
  });
}
