/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which door or window the "Opening and symbol" card (`JoinerySymbolCard`) is for, from the renderer ids selected in a drawing (#656):
 * exactly one, a door or a window, that the model does not type itself (an element the model configures has no card: its own type
 * says how it is drawn). Read-only; the model and the project are not touched.
 */

import { useViewerStore } from '@/store';
import { drawnJoinery, elementFacts } from './mapped-joinery';

export interface SymbolCardTarget { modelId: string; expressId: number }

export function symbolCardTarget(renderIds: readonly number[]): SymbolCardTarget | null {
  const unique = [...new Set(renderIds)];
  if (unique.length !== 1) return null;
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(unique[0]);
  if (!ref) return null;
  const type = String(s.models.get(ref.modelId)?.ifcDataStore?.entities.getTypeName(ref.expressId) ?? '').toUpperCase();
  if (!/^IFC(DOOR|WINDOW)/.test(type)) return null;
  if (!elementFacts(ref.modelId, ref.expressId)) return null;
  if (drawnJoinery(ref.modelId, ref.expressId)?.source === 'model') return null;
  return ref;
}
