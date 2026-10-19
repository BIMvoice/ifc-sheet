/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Editing the CAD layer table (`cad-layers.ts`): pure list operations, and
 * the store actions the configurator calls.
 */

import { aiaStarterRules } from './cad-layers-aia';
import { isoStarterRules } from './cad-layers-iso';
import type { CadLayerRule } from './cad-layers';
import { useProjectStore } from './project-store';
import { freshProjectId } from './view-defaults';

/** `rules` with `id` moved by `delta` places (clamped at the ends). */
export function moveRule(rules: readonly CadLayerRule[], id: string, delta: number): CadLayerRule[] {
  const from = rules.findIndex((r) => r.id === id);
  if (from < 0) return [...rules];
  const to = Math.min(rules.length - 1, Math.max(0, from + delta));
  const out = [...rules];
  const [rule] = out.splice(from, 1);
  out.splice(to, 0, rule);
  return out;
}

/** A rule with `patch` applied; a key set to undefined is removed. */
export function patchRule(rules: readonly CadLayerRule[], id: string, patch: Partial<CadLayerRule>): CadLayerRule[] {
  return rules.map((r) => {
    if (r.id !== id) return r;
    const next: Record<string, unknown> = { ...r, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    return next as unknown as CadLayerRule;
  });
}

const set = (cadLayers: CadLayerRule[]) => useProjectStore.setState({ cadLayers, dirty: true });
const current = () => useProjectStore.getState().cadLayers ?? [];

export function addCadRule(layer: string): string {
  const id = freshProjectId('cad');
  set([...current(), { id, layer }]);
  return id;
}
export const removeCadRule = (id: string) => set(current().filter((r) => r.id !== id));
export const moveCadRule = (id: string, delta: number) => set(moveRule(current(), id, delta));
export const updateCadRule = (id: string, patch: Partial<CadLayerRule>) => set(patchRule(current(), id, patch));
/** Replace the table with the ISO 13567-style starter. */
export const resetCadRulesToIso = () => set(isoStarterRules());
/** Replace the table with the AIA / NCS-style preset. */
export const resetCadRulesToAia = () => set(aiaStarterRules());
export const clearCadRules = () => set([]);
