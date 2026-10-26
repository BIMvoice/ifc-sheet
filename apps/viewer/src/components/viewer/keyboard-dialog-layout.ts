/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Info dialog's box (#342). `DialogContent` is a CSS grid, and a grid's
 * implicit column is `auto`: it grows to the widest unbreakable content, so
 * in Română a long label or the Learn tab made the column (and the header and
 * tab panel in it) wider than the dialog, and the box clipped what stuck out.
 * One `minmax(0,1fr)` column lets every child shrink to the box and wrap;
 * the box itself is bounded by the viewport in both axes, and each tab panel
 * scrolls inside it.
 */
export const INFO_DIALOG = 'w-full max-w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden gap-0 p-0 bg-card';

/** A tab panel: shrinks to the column, wraps long words, scrolls on its own. */
export const INFO_PANEL = 'min-w-0 break-words p-4 overflow-y-auto overflow-x-hidden';
