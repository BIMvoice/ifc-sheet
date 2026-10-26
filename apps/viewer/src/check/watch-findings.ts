/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tells when what the checks read has changed (`FINDING_INPUTS`), a moment after it stops changing. The shape is the
 * autosave's (`watchProjectForAutosave`): a store subscription that compares the keys it cares about and restarts one
 * timer, so a burst of edits (a TAGALL placing a tag per door) is one recompute, and a change to anything else (the
 * camera, a panel opening) is none.
 */

import { subscribeDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import { useViewerStore } from '@/store';
import { FINDING_INPUTS } from './inputs';

export const FINDINGS_DEBOUNCE_MS = 250;

/** Starts watching; `onChange` runs once after a burst. Returns the stop function. */
export function watchFindingInputs(onChange: () => void, debounceMs = FINDINGS_DEBOUNCE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const watch = <S extends object>(store: { subscribe(listener: (state: S, prev: S) => void): () => void }, keys: readonly (keyof S)[]) => store.subscribe((state, prev) => {
    if (keys.some((k) => !Object.is(state[k], prev[k]))) changed();
  });
  const stops = [
    watch(useProjectStore, FINDING_INPUTS.project),
    watch(useViewDrawings, FINDING_INPUTS.viewDrawings),
    watch(useViewerStore, FINDING_INPUTS.viewer),
    subscribeDrawingRuntime(changed),
  ];
  return () => {
    clearTimeout(timer);
    stops.forEach((stop) => stop());
  };
}
