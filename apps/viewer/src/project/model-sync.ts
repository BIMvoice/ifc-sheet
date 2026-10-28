/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What `syncProjectWithModels` compares and merges when the loaded models or their levels change (`project-store.ts`). */

import type { ProjectLevel, ProjectModelRef } from './types';

/** Whether every loaded model is already in the project's model list. */
export function knowsAll(known: readonly ProjectModelRef[], loaded: readonly ProjectModelRef[]): boolean {
  return loaded.every((m) => known.some((k) => k.key === m.key));
}

/** Keep models the project already knew (a file may name models not loaded yet), add new ones. */
export function mergeModels(known: readonly ProjectModelRef[], loaded: readonly ProjectModelRef[]): ProjectModelRef[] {
  const merged = [...known];
  for (const model of loaded) if (!merged.some((m) => m.key === model.key)) merged.push(model);
  return merged;
}

export function sameLevels(a: readonly ProjectLevel[], b: readonly ProjectLevel[]): boolean {
  return a.length === b.length && a.every((l, i) => l.name === b[i].name && l.elevation === b[i].elevation && l.floorY === b[i].floorY);
}
