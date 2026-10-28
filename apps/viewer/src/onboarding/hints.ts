/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * First-use hints (#455): a one-line note shown where a feature applies, until
 * the person dismisses it. Which hints were dismissed, and whether hints are
 * on at all, live in this browser's storage and survive a reload. Every storage
 * access is wrapped: a browser that refuses it just keeps the choice for this
 * session, and every hint still renders.
 */

import { useSyncExternalStore } from 'react';

export const HINT_IDS = ['viewportResize', 'ortho', 'openView', 'openSheet'] as const;
export type HintId = (typeof HINT_IDS)[number];

export const HINTS_STORAGE_KEY = 'ifcsheet:hints:v1';

interface HintState {
  /** Hints off in Settings: none shows. */
  on: boolean;
  dismissed: readonly HintId[];
}

let state: HintState | null = null;
const listeners = new Set<() => void>();

const isHintId = (v: unknown): v is HintId => HINT_IDS.some((id) => id === v);

function load(): HintState {
  try {
    const raw = window.localStorage.getItem(HINTS_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const { on, dismissed } = parsed as { on?: unknown; dismissed?: unknown };
        return { on: on !== false, dismissed: Array.isArray(dismissed) ? dismissed.filter(isHintId) : [] };
      }
    }
  } catch {
    // Storage refused or the value is damaged: start with every hint showing.
  }
  return { on: true, dismissed: [] };
}

function current(): HintState {
  state ??= load();
  return state;
}

function commit(next: HintState): void {
  state = next;
  try {
    window.localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not stored: the choice holds for this session.
  }
  for (const listener of listeners) listener();
}

/** Whether the hint should show now: hints are on and this one was not dismissed. */
export function isHintVisible(id: HintId): boolean {
  const s = current();
  return s.on && !s.dismissed.includes(id);
}

export function dismissHint(id: HintId): void {
  const s = current();
  if (!s.dismissed.includes(id)) commit({ ...s, dismissed: [...s.dismissed, id] });
}

export function hintsEnabled(): boolean {
  return current().on;
}

/** Settings: off hides every hint; on brings back the ones dismissed before. */
export function setHintsEnabled(on: boolean): void {
  commit(on ? { on: true, dismissed: [] } : { ...current(), on: false });
}

/** Test seam: forget the in-memory copy so the next read comes from storage, as after a reload. */
export function forgetHintStateForTests(): void {
  state = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHintVisible(id: HintId): boolean {
  return useSyncExternalStore(subscribe, () => isHintVisible(id), () => false);
}

export function useHintsEnabled(): boolean {
  return useSyncExternalStore(subscribe, hintsEnabled, () => true);
}
