/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The session on offer (`recovery.ts` keeps it in its own slot): held here from the models loading
 * until the user answers. Nothing short of an answer ends it: hanging the set, editing, or closing
 * the page leaves it on offer, on the intro screen and in the project drawer, at the next start too.
 * Restoring goes through `loadProjectDocument`, as opening a file does.
 */

import { create } from 'zustand';
import { deleteModelState, readModelState } from './autosave-snapshots';
import { loadProjectDocument, useProjectStore } from './project-store';
import { dropRecoverable, recoverableKey } from './recovery';
import { restoreRasters } from './autosave-rasters';
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
}

/** Puts the model state kept under `stateKey` into the project, if slot `key` is still the one in front and the project has none. */
export async function restoreModelState(key: string, current: () => string | null, stateKey: string = key): Promise<void> {
  const kept = await readModelState(stateKey);
  if (kept && current() === key && !useProjectStore.getState().modelState) useProjectStore.setState({ modelState: kept });
}

/** Puts the offered session in place, as work not yet saved to a file; its slot is removed once it is loaded. */
export function restoreRecovery(storage?: Pick<Storage, 'removeItem'>): void {
  const { offer } = useRecoveryStore.getState();
  if (!offer) return;
  loadProjectDocument(offer.doc, { dirty: true, fromAutosave: true });
  useRecoveryStore.setState({ offer: null });
  dropRecoverable(offer.key, storage);
  const stateKey = recoverableKey(offer.key);
  void restoreModelState(offer.key, () => offer.key, stateKey).then(() => deleteModelState(stateKey));
  void restoreRasters(offer.key, () => offer.key);
}
