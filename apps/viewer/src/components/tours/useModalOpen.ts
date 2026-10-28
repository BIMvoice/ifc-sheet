/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Is a modal dialog open right now? One rule for every dialog in the app: a
 * modal declares itself with `aria-modal="true"` (the shared `DialogContent`
 * sets it for Radix modals; the Print preview's native `<dialog>` sets it
 * itself). A closing Radix dialog keeps its node through the exit animation
 * with `data-state="closed"`, which does not count. The tour's own card is a
 * non-modal coachmark and never sets `aria-modal`, so it cannot pause itself.
 */

import { useSyncExternalStore } from 'react';

const OPEN_MODAL = '[aria-modal="true"]:not([data-state="closed"])';

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-modal', 'data-state'],
  });
  return () => observer.disconnect();
}

const snapshot = (): boolean => document.body.querySelector(OPEN_MODAL) !== null;

export function useModalOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
