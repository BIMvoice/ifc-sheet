/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lends the one drafting session to another view for a while (#448: the plan symbol editor opens over whatever the user was in) and
 * gives it back. The session and its providers are global, one drafting view at a time; the view shown over the other takes them and,
 * on leaving, clears them, so the view underneath would be drafting on the symbol's entities until it remounted.
 */

import { attachDraftingView, draftSizeScale, useDraftingSession } from './session';
import { parkViewProviders, referenceProviderOf } from './session-providers';

/** Keeps the session as it is now; the returned function points it at that view again, with the providers and the size scale it had. */
export function parkDraftingSession(): () => void {
  const { viewId, axis } = useDraftingSession.getState();
  const scale = draftSizeScale();
  const references = referenceProviderOf();
  const restoreProviders = parkViewProviders();
  return () => {
    restoreProviders();
    attachDraftingView(viewId, axis, references, scale);
  };
}
