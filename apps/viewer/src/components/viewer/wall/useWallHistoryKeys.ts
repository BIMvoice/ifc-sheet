/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Undo and redo on the whole Wall (#51), where no drawing is in front and so no `useDraftingKeys` is mounted: the keys of the
 * `drafting.undo` / `drafting.redo` rows, as bound now, run the same `undoLatest` / `redoEarliest` a sheet's do. Capture phase
 * and a prevented event, as `useDraftingKeys` does, so the viewer's own Ctrl+Z (the model workspace's history) does not also run.
 * A text field and an open dialog or menu keep the keys.
 */

import { useEffect } from 'react';
import { openKeyboardOverlay } from '@/lib/commands/dispatcher';
import { isDraftingKey } from '../drafting/drafting-key-match';
import { runDraftingAction } from '../drafting/run-action';

const HISTORY = ['drafting.undo', 'drafting.redo'] as const;

export function useWallHistoryKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.closest('[data-owns-keys]') || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (openKeyboardOverlay()) return;
      const id = HISTORY.find((row) => isDraftingKey(row, e));
      if (!id) return;
      e.preventDefault();
      runDraftingAction(id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
