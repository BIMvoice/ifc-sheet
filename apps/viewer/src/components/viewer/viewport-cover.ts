/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether something is laid over the 3D viewport, so that nobody can see it
 * (#154). IfcSheet's Wall is a full-screen face over the engine's interface,
 * which stays mounted underneath for its drawing runtime; the 3D view behind
 * it must not render or upload its scene, which on a large model costs seconds
 * of main-thread time that nobody sees. The render loop pauses while this is
 * set and picks up where it left off when it is cleared.
 */

let covers = 0;
const listeners = new Set<() => void>();

/** Whether the 3D viewport is hidden behind another surface right now. */
export const isViewportCovered = (): boolean => covers > 0;

/** Cover the viewport; the returned function lifts this cover (once). */
export function coverViewport(): () => void {
  let held = true;
  covers++;
  if (covers === 1) for (const fn of [...listeners]) fn();
  return () => {
    if (!held) return;
    held = false;
    covers--;
    if (covers === 0) for (const fn of [...listeners]) fn();
  };
}

/** Called when the viewport becomes covered or uncovered. */
export function onViewportCoverChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
