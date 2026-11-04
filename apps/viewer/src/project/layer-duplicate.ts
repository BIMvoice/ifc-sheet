/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Duplicate a layer (#669): the copy keeps the colour, pen weight, line type, draw order, visibility, lock, print flag and
 * group of the original, stands right below it, and is named "<name> copy" ("<name> copy 2" and so on while that name is
 * taken). No drafted element moves to it. The words come in as functions so the plain logic needs no catalogue.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import type { DraftLayer } from '@/drafting/types';
import { useProjectStore } from './project-store';
import { freshProjectId } from './view-defaults';

export interface CopyNames {
  /** "<name> copy". */
  first(name: string): string;
  /** "<name> copy <n>", for n of 2 and up. */
  nth(name: string, n: number): string;
}

/** The first of "<name> copy", "<name> copy 2", "<name> copy 3" ... that no layer is called, compared ignoring case and surrounding spaces. */
export function copyName(layers: readonly DraftLayer[], name: string, names: CopyNames): string {
  const taken = new Set(layers.map((l) => l.name.trim().toLowerCase()));
  let candidate = names.first(name);
  for (let n = 2; taken.has(candidate.trim().toLowerCase()); n += 1) candidate = names.nth(name, n);
  return candidate;
}

/** `layers` with a copy of layer `id` right below it, and the copy's id; null when there is no such layer. */
export function duplicateLayerIn(
  layers: readonly DraftLayer[], id: string, newId: string, names: CopyNames,
): { layers: DraftLayer[]; copyId: string } | null {
  const at = layers.findIndex((l) => l.id === id);
  if (at < 0) return null;
  const original = layers[at];
  const copy: DraftLayer = { ...original, id: newId, name: copyName(layers, original.name, names) };
  return { layers: [...layers.slice(0, at + 1), copy, ...layers.slice(at + 1)], copyId: newId };
}

/** Duplicate layer `id` of the project as one undo step. Returns the new layer's id, or null when there is no such layer. */
export function duplicateLayer(id: string, names: CopyNames): string | null {
  let made: string | null = null;
  runAsOneUndoStep(() => {
    const s = useProjectStore.getState();
    const result = duplicateLayerIn(s.draftLayers, id, freshProjectId('layer'), names);
    if (!result) return;
    useProjectStore.setState({ draftLayers: result.layers, dirty: true });
    made = result.copyId;
  });
  return made;
}
