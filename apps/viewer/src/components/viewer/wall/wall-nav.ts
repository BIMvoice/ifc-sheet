/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the Wall is: on the wall, or stepped into a sheet (with one of its
 * drawings brought forward), and whether the project drawer is open. A store,
 * so the drawer and the top bar can move it as well as the wall itself.
 */

import { create } from 'zustand';
import { emitWallStepped } from '@/lib/tours/events';

export type WallPanel = 'drawer' | 'missing' | 'issue' | 'changed';

interface WallNav {
  /** The sheet stepped into, or null on the wall. */
  stepped: string | null;
  /** The drawing brought forward on arrival. */
  focus: string | null;
  /** Bumped on every step, so arriving at the same sheet again starts it fresh. */
  visit: number;
  /**
   * The ONE panel open on the right of the Wall, or null: the project drawer, what is missing from the set, issuing
   * it, or what changed in the model. They share one place, so opening one replaces the one in front (#296).
   */
  panel: WallPanel | null;
  /** The split schedule whose parts are being reviewed element by element (#186), or null. */
  review: string | null;
}

export const useWallNav = create<WallNav>()(() => ({ stepped: null, focus: null, visit: 0, panel: null, review: null }));

export function stepInto(sheetId: string | null, focus: string | null = null): void {
  useWallNav.setState((s) => ({ stepped: sheetId, focus, visit: s.visit + 1 }));
  if (sheetId) emitWallStepped(sheetId);
}

/** The control that had focus when the panel in front opened (it replaces the one before's): Esc hands focus back to it. */
let opener: HTMLElement | null = null;

/** Open `panel` (replacing any other), or close the one in front with null. Focus is left where it is. */
export function setPanel(panel: WallPanel | null): void {
  if (panel !== null && useWallNav.getState().panel !== panel) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  useWallNav.setState({ panel });
  if (panel === null) opener = null;
}

/** Whether the project drawer is the panel in front. */
export const useDrawerOpen = (): boolean => useWallNav((s) => s.panel === 'drawer');

export function setDrawer(open: boolean): void {
  if (open) setPanel('drawer');
  else if (useWallNav.getState().panel === 'drawer') setPanel(null);
}

/** Close the panel in front and return focus to the control that opened it. False when none is open. */
export function closeFrontPanel(): boolean {
  if (useWallNav.getState().panel === null) return false;
  const back = opener;
  setPanel(null);
  if (back?.isConnected) back.focus();
  return true;
}

/** Open the review by element of the split schedule `scheduleId`, or close it with null. */
export function setReview(scheduleId: string | null): void {
  useWallNav.setState({ review: scheduleId });
}
