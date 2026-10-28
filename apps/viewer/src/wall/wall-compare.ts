/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two sheets side by side on the Wall (#498): which two, whether they pan together, and the sheet a first click on a card
 * has marked while the second is awaited. The Wall's own zoom is not touched, so closing the comparison finds it as it was.
 */

import { create } from 'zustand';

interface WallCompare {
  /** The sheet marked on its card, waiting for a second one; null when none. */
  pick: string | null;
  /** The two sheets compared, left and right; null when the Wall shows. */
  pair: [string, string] | null;
  /** Whether panning one pane pans the other by the same amount. */
  together: boolean;
}

const INITIAL: WallCompare = { pick: null, pair: null, together: true };

export const useWallCompare = create<WallCompare>()(() => INITIAL);

/** A click on a card's Compare button: the first marks the sheet, a second (another sheet) opens the comparison, the same one again lets go. */
export function pickForCompare(id: string): void {
  const { pick } = useWallCompare.getState();
  if (pick === null) useWallCompare.setState({ pick: id });
  else if (pick === id) useWallCompare.setState({ pick: null });
  else useWallCompare.setState({ pick: null, pair: [pick, id] });
}

export const openCompare = (left: string, right: string): void => useWallCompare.setState({ pick: null, pair: [left, right] });
export const closeCompare = (): void => useWallCompare.setState({ pick: null, pair: null });
export const cancelPick = (): void => useWallCompare.setState({ pick: null });
export const setPanTogether = (together: boolean): void => useWallCompare.setState({ together });

export function swapCompare(): void {
  const { pair } = useWallCompare.getState();
  if (pair) useWallCompare.setState({ pair: [pair[1], pair[0]] });
}

/** Put `id` in one side of the pair. Choosing the sheet the other side shows swaps them, so the two stay two. */
export function setCompareSide(side: 0 | 1, id: string): void {
  const { pair } = useWallCompare.getState();
  if (!pair || pair[side] === id) return;
  useWallCompare.setState({ pair: pair[1 - side] === id ? [pair[1], pair[0]] : side === 0 ? [id, pair[1]] : [pair[0], id] });
}

export const resetWallCompare = (): void => useWallCompare.setState(INITIAL);
