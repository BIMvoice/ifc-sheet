/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The classes the set's panels (what is missing, issuing) wear on each surface that shows them. */
export interface SetSkin {
  /** A button. */
  button: string;
  /** The small button beside a finding. */
  fixButton: string;
  /** A finding's text, which goes to its place. */
  link: string;
  /** Secondary text. */
  note: string;
  /** A sheet's title in the list. */
  heading: string;
  input: string;
  check: string;
}

const wallButton = 'rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70 disabled:opacity-40';

/** The Wall's navy panels. */
export const WALL_SKIN: SetSkin = {
  button: wallButton,
  fixButton: `${wallButton} shrink-0 px-2 py-0 text-xs`,
  link: 'text-left text-sky-100 underline-offset-2 hover:underline',
  note: 'm-0 text-sky-200/80',
  heading: 'm-0 mb-1 font-semibold text-white',
  input: 'rounded-md border border-sky-300/30 bg-transparent px-3 py-1.5 text-sky-50 placeholder:text-sky-300/50',
  check: 'flex items-center gap-2 text-sky-100',
};

/** The sheet side panel. */
export const PANEL_SKIN: SetSkin = {
  button: 'rounded-sm border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40',
  fixButton: 'shrink-0 rounded-sm border border-zinc-300 dark:border-zinc-700 px-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-40',
  link: 'text-left underline-offset-2 hover:underline',
  note: 'm-0 text-zinc-500',
  heading: 'm-0 font-semibold',
  input: 'h-6 w-full rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1',
  check: 'flex items-center gap-2',
};
