/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The AutoCAD mode switch (#168): off unless the person turns it on, kept per
 * browser in `localStorage` as the key bindings are (`key-bindings.ts`).
 * Storage that is blocked leaves the mode off, and a change holds for the
 * session.
 *
 * What the mode changes is read where it acts: typed aliases and Enter to
 * repeat them (`components/viewer/drafting/typed-line.ts`), and bare keys
 * that always go to the command line (`useDraftingKeys.ts`).
 */

import { create } from 'zustand';

export const AUTOCAD_MODE_STORAGE_KEY = 'ifcsheet:autocad-mode';

function stored(): boolean {
  try {
    return globalThis.localStorage?.getItem(AUTOCAD_MODE_STORAGE_KEY) === 'on';
  } catch (error) {
    console.warn('[autocad-mode] storage unavailable, the mode stays off', error);
    return false;
  }
}

export const useAutocadMode = create<{ on: boolean }>()(() => ({ on: stored() }));

export function autocadModeOn(): boolean {
  return useAutocadMode.getState().on;
}

export function setAutocadMode(on: boolean): void {
  useAutocadMode.setState({ on });
  try {
    if (on) globalThis.localStorage?.setItem(AUTOCAD_MODE_STORAGE_KEY, 'on');
    else globalThis.localStorage?.removeItem(AUTOCAD_MODE_STORAGE_KEY);
  } catch (error) {
    console.warn('[autocad-mode] storage unavailable, the change holds for this session', error);
  }
}

/** Read the saved switch again (another tab saved, or a test changed storage). */
export function loadAutocadMode(): void {
  useAutocadMode.setState({ on: stored() });
}
