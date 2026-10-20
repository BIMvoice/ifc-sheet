/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Writes the project to its autosave slot a moment after it changes. While an autosave is on offer
 * (`recovery-store.ts`) nothing is written, so the work on offer is not replaced before it is
 * answered; the first change the user makes ends the offer (see `recovery-store.ts`) and is then
 * written like any other.
 */

import { writeAutosave } from './recovery';
import { PROJECT_DOCUMENT_KEYS, projectDocument, useProjectStore } from './project-store';
import { recoveryOpenFor } from './recovery-store';

export const AUTOSAVE_DEBOUNCE_MS = 500;

/** Starts watching; `slot` is the slot of the models in front. Returns the stop function. */
export function watchProjectForAutosave(slot: () => string | null, write: (key: string) => void = (key) => void writeAutosave(key, projectDocument()), debounceMs = AUTOSAVE_DEBOUNCE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useProjectStore.subscribe((state, prev) => {
    const key = slot();
    if (!key || recoveryOpenFor(key) || PROJECT_DOCUMENT_KEYS.every((k) => state[k] === prev[k])) return;
    clearTimeout(timer);
    timer = setTimeout(() => write(key), debounceMs);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
