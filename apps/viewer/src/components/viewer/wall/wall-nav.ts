/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the Wall is: on the wall, or stepped into a sheet (with one of its
 * drawings brought forward), and whether the project drawer is open. A store,
 * so the drawer and the top bar can move it as well as the wall itself.
 */

import { create } from 'zustand';

interface WallNav {
  /** The sheet stepped into, or null on the wall. */
  stepped: string | null;
  /** The drawing brought forward on arrival. */
  focus: string | null;
  /** Bumped on every step, so arriving at the same sheet again starts it fresh. */
  visit: number;
  drawer: boolean;
  /** The panel from the top bar that is open: what is missing from the set, or issuing it. */
  panel: 'missing' | 'issue' | null;
}

export const useWallNav = create<WallNav>()(() => ({ stepped: null, focus: null, visit: 0, drawer: false, panel: null }));

export function stepInto(sheetId: string | null, focus: string | null = null): void {
  useWallNav.setState((s) => ({ stepped: sheetId, focus, visit: s.visit + 1 }));
}

export function setDrawer(open: boolean): void {
  useWallNav.setState({ drawer: open });
}

export function setPanel(panel: WallNav['panel']): void {
  useWallNav.setState({ panel });
}
