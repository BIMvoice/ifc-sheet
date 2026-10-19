/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The autosave on offer: held here between the models loading and the user's answer on the intro
 * screen. Restoring goes through `loadProjectDocument`, as opening a file does. Declining keeps the
 * slot as it is, but only until the next autosave overwrites it; `project-sync.ts` writes nothing
 * for the slot while the offer is open, so the work on offer is not replaced before it is answered.
 */

import { create } from 'zustand';
import { readModelState } from './autosave-snapshots';
import { loadProjectDocument, PROJECT_DOCUMENT_KEYS, useProjectStore } from './project-store';
import type { ProjectDocument } from './types';

export interface RecoveryOffer {
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

/** The user went on without it (Discard, or hanging the set): the slot is the next autosave's to overwrite. */
export function discardRecovery(): void {
  if (useRecoveryStore.getState().offer) useRecoveryStore.setState({ offer: null });
}

export const recoveryOpenFor = (key: string | null): boolean => key !== null && useRecoveryStore.getState().offer?.key === key;

/** Puts the model state kept for `key` into the project the slot restored, if it is still the one in front and has none. */
export async function restoreModelState(key: string, current: () => string | null): Promise<void> {
  const kept = await readModelState(key);
  if (kept && current() === key && !useProjectStore.getState().modelState) useProjectStore.setState({ modelState: kept });
}

/** Puts the offered autosave in place, as work not yet saved to a file. */
export function restoreRecovery(): void {
  const { offer } = useRecoveryStore.getState();
  if (!offer) return;
  useRecoveryStore.setState({ offer: null });
  loadProjectDocument(offer.doc, { dirty: true, fromAutosave: true });
  void restoreModelState(offer.key, () => offer.key);
}

let systemDepth = 0;

/** Runs `fn`, whose changes to the project are the app's own (laying out the set, following the models), not the user's. */
export function duringSystemChange<T>(fn: () => T): T {
  systemDepth++;
  try {
    return fn();
  } finally {
    systemDepth--;
  }
}

/** Lays out the drawing set under an open offer; if there is no set to lay out there is no intro to show the offer on, so it ends. */
export function startSetUnderOffer(start: () => boolean): boolean {
  const started = duringSystemChange(start);
  if (!started) discardRecovery();
  return started;
}

// The first change the user makes to an open project answers the offer with Discard. Registered here,
// ahead of the autosave watcher, so the change that ends the offer is the first one written.
useProjectStore.subscribe((state, prev) => {
  if (systemDepth > 0 || !useRecoveryStore.getState().offer) return;
  if (PROJECT_DOCUMENT_KEYS.some((k) => k !== 'modelState' && state[k] !== prev[k])) discardRecovery();
});
