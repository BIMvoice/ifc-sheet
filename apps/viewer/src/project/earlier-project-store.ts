/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project of an earlier version of the loaded model, on offer (#922, `earlier-autosave.ts` finds it): from the
 * models loading with no autosave of their own until the person answers Continue (`whatchanged/continue-earlier.ts`)
 * or Start new, or other models replace these. Neither answer writes the earlier slot: Continue copies its project
 * onto the new model, whose own slot it is autosaved to from then on; Start new only takes the offer away.
 */

import { create } from 'zustand';
import { useViewerStore } from '@/store';
import { findEarlierAutosave, noteSlotIdentity, type EarlierAutosave, type ModelIdentity } from './earlier-autosave';
import { projectGuidOfStore } from './model-identity';

export interface EarlierProjectOffer extends EarlierAutosave {
  /** The slot of the models in front, which the offer is for. */
  forKey: string;
}

export const useEarlierProjectStore = create<{ offer: EarlierProjectOffer | null }>()(() => ({ offer: null }));

/** The loaded models as an earlier version of them is recognised by; null when one has no IfcProject GlobalId. */
export function loadedIdentity(): ModelIdentity[] | null {
  const out: ModelIdentity[] = [];
  for (const model of useViewerStore.getState().models.values()) {
    if (!model.ifcDataStore) continue;
    const projectGlobalId = projectGuidOfStore(model.ifcDataStore);
    if (!projectGlobalId) return null;
    out.push({ projectGlobalId, name: model.name });
  }
  return out.length > 0 ? out : null;
}

/** Notes which models slot `key` is for, so a later version of them can find it. */
export function noteLoadedIdentity(key: string): void {
  const identity = loadedIdentity();
  if (identity) noteSlotIdentity(key, identity);
}

/** The models of slot `key` have no autosave: offer the project of an earlier version of them, if there is one. */
export function offerEarlierProject(key: string, storeyGlobalIds: ReadonlySet<string>): void {
  let found: EarlierAutosave | null = null;
  try {
    const identity = loadedIdentity();
    found = identity ? findEarlierAutosave(key, identity, storeyGlobalIds) : null;
  } catch (err) {
    // The model is in either way: an offer that cannot be worked out is left out, not a load that fails.
    console.warn('[project] could not look for the project of an earlier version of these models', err);
  }
  useEarlierProjectStore.setState({ offer: found ? { ...found, forKey: key } : null });
}

/** Other models are in front, or the person answered: the offer goes; the earlier autosave stays where it is. */
export function forgetEarlierProject(): void {
  if (useEarlierProjectStore.getState().offer) useEarlierProjectStore.setState({ offer: null });
}
