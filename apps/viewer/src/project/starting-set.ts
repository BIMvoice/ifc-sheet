/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The starting set the Wall laid out in this session, remembered so that a model arriving after it can be taken into
 * account (#863). Several models opened together load one after the other, and the set is laid out as soon as the first
 * one is in: without this, a small structural model opened with a large architectural one gave the whole project a set
 * measured on the structure alone.
 *
 * The rule: the set is laid out again for all the loaded models when a model arrives while the project is still exactly
 * the starting set. "Exactly" is by identity, the way the undo steps tell a change (`draft-store.ts`): every field of the
 * project is the very value the start left, every view it made is still there unchanged, and the only views added since
 * are the plans the model sync gives a new model's levels. Anything else (a sheet renamed or moved, a view edited, a
 * line drawn, a sheet issued, a title block typed) means the person has worked on the set, and it is kept: the new
 * levels then get their plans as before, for DRAFTSET to hang. A project restored from a file or an autosave was never
 * laid out in this session, so it is never laid out again; nor is a set made by a set template.
 */

import type { ProjectState } from './project-store';

/** What the arrival of a model changes on its own: the models, their levels, the views (checked apart), and the store's own flags. */
const FOLLOWS_THE_MODELS: ReadonlySet<string> = new Set<keyof ProjectState>(['models', 'levels', 'views', 'dirty', 'activeItemId']);

/** The project as the start left it, and the models it was laid out for. */
export interface StartingSet {
  state: ProjectState;
  models: readonly string[];
}

let started: StartingSet | null = null;

/** Remember `state` as the starting set just laid out. */
export function rememberStartingSet(state: ProjectState): void {
  started = { state, models: state.models.map((m) => m.key) };
}

/** Forget the starting set: the project now holds something else. */
export function forgetStartingSet(): void {
  started = null;
}

/** The starting set remembered, if any. */
export function startingSet(): StartingSet | null {
  return started;
}

/** Whether `state` holds a model the starting set was not laid out for. */
export function hasNewModel(set: StartingSet, state: ProjectState): boolean {
  return state.models.some((m) => !set.models.includes(m.key));
}

/** Whether `state` is still the starting set `set`, as the rule in this file's header reads it. */
export function isUntouched(set: StartingSet, state: ProjectState): boolean {
  const keys = new Set([...Object.keys(set.state), ...Object.keys(state)]) as Set<keyof ProjectState>;
  for (const key of keys) if (!FOLLOWS_THE_MODELS.has(key) && state[key] !== set.state[key]) return false;
  const made = set.state.views;
  if (state.views.length < made.length || made.some((v, i) => state.views[i] !== v)) return false;
  return state.views.slice(made.length).every((v) => v.kind === 'plan' && !v.detail && !v.discipline && !v.site);
}
