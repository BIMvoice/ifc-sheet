/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which sections of the viewport card the user opened or closed (#290), kept for the session. Only a choice made by hand is
 * kept: a section never touched follows its default (open when it has a warning or settings off the default), so it is not
 * pinned by a visit. localStorage is a per-viewer convenience; where it is unavailable the choices live in memory.
 */

import { useSyncExternalStore } from 'react';

const KEY = 'ifcsheet.wall.cardSections';

type Choices = Readonly<Record<string, boolean>>;

let choices: Choices | null = null;
const listeners = new Set<() => void>();

function read(): Choices {
  if (choices) return choices;
  const kept: Record<string, boolean> = {};
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') for (const [id, v] of Object.entries(parsed)) if (typeof v === 'boolean') kept[id] = v;
  } catch { /* no storage, or damaged: start from the defaults */ }
  choices = kept;
  return choices;
}

/** Remember that section `id` was opened or closed by hand. */
export function setSectionOpen(id: string, open: boolean): void {
  choices = { ...read(), [id]: open };
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(choices)); } catch { /* kept in memory only */ }
  for (const l of listeners) l();
}

/** Forget every choice (tests, and a fresh start). */
export function resetSectionChoices(): void {
  choices = {};
  try { globalThis.localStorage?.removeItem(KEY); } catch { /* nothing kept */ }
  for (const l of listeners) l();
}

/** Read the choices again from storage (a reopened session, in a test). */
export function reloadSectionChoices(): void {
  choices = null;
  for (const l of listeners) l();
}

const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The choice made by hand for section `id`; undefined while it follows its default. */
export function useSectionChoice(id: string): boolean | undefined {
  return useSyncExternalStore(subscribe, () => read()[id]);
}
