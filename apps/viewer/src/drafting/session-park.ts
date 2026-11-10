/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lends the one drafting session to another view for a while (#448: the plan symbol editor opens over whatever the user was in) and
 * gives it back. The session and its providers are global, one drafting view at a time, so the view shown over the other is a guest on
 * them: the whole session is kept (selection, running command and its state, history lines, settings) and put back untouched. The undo
 * history is kept apart the same way (`parkDraftHistory`, called by `openSymbolDrafts`), so what the guest draws is never in it.
 */

import { attachDraftingView, draftSizeScale, parkSession, useDraftingSession } from './session';
import { parkViewProviders, referenceProviderOf } from './session-providers';

/** Keeps the session as it is now; the returned function gives it back as it was, with the providers and the size scale it had. */
export function parkDraftingSession(): () => void {
  const { viewId, axis } = useDraftingSession.getState();
  const scale = draftSizeScale();
  const references = referenceProviderOf();
  const restoreProviders = parkViewProviders();
  const restoreSession = parkSession();
  return () => {
    restoreProviders();
    // Re-points the view-bound inputs (screen frame of the axis) at the view underneath; the session itself is then put back whole.
    attachDraftingView(viewId, axis, references, scale);
    restoreSession();
  };
}
