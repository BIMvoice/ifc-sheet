/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether tracking lines are on (#667). A per-user preference, kept in this browser and not in the
 * project: it is a way of working, like the pointer speed, so a project opened by somebody else
 * draws the way they like. On by default.
 */

import { create } from 'zustand';

export const TRACKING_KEY = 'ifcsheet.drafting.tracking';

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(TRACKING_KEY) !== 'off';
  } catch (err) {
    console.warn('Tracking preference could not be read; it stays on.', err);
    return true;
  }
}

function write(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(TRACKING_KEY, on ? 'on' : 'off');
  } catch (err) {
    console.warn('Tracking preference could not be saved; it holds for this session only.', err);
  }
}

export const useTrackingPref = create<{ on: boolean }>()(() => ({ on: read() }));

export function setTracking(on: boolean): void {
  write(on);
  useTrackingPref.setState({ on });
}

export function toggleTracking(): void {
  setTracking(!useTrackingPref.getState().on);
}
