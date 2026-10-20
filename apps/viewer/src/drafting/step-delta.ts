/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a grouped undo step did to a list of things with ids: which it added,
 * which it removed and which it changed. Undo and redo apply that difference
 * to the list as it is NOW, so anything added or changed after the step
 * stays.
 */

export interface Delta<T extends { id: string }> {
  added: T[];
  removed: T[];
  changed: { before: T; after: T }[];
}

export function diffById<T extends { id: string }>(before: readonly T[], after: readonly T[]): Delta<T> {
  const was = new Map(before.map((t) => [t.id, t]));
  const is = new Map(after.map((t) => [t.id, t]));
  return {
    added: after.filter((t) => !was.has(t.id)),
    removed: before.filter((t) => !is.has(t.id)),
    changed: after.flatMap((t) => { const b = was.get(t.id); return b && b !== t ? [{ before: b, after: t }] : []; }),
  };
}

export const isEmptyDelta = (d: Delta<{ id: string }>): boolean => d.added.length + d.removed.length + d.changed.length === 0;

/** `current` with the step taken back: what it added removed, what it removed back, what it changed as it was (unless changed since). */
export function undoDelta<T extends { id: string }>(current: readonly T[], d: Delta<T>): T[] {
  const gone = new Set(d.added.map((t) => t.id));
  const back = new Map(d.changed.map((c) => [c.after.id, c]));
  const kept = current.filter((t) => !gone.has(t.id)).map((t) => { const c = back.get(t.id); return c && c.after === t ? c.before : t; });
  const have = new Set(kept.map((t) => t.id));
  return [...kept, ...d.removed.filter((t) => !have.has(t.id))];
}

/** `current` with the step made again. */
export function redoDelta<T extends { id: string }>(current: readonly T[], d: Delta<T>): T[] {
  const gone = new Set(d.removed.map((t) => t.id));
  const forward = new Map(d.changed.map((c) => [c.before.id, c]));
  const kept = current.filter((t) => !gone.has(t.id)).map((t) => { const c = forward.get(t.id); return c && c.before === t ? c.after : t; });
  const have = new Set(kept.map((t) => t.id));
  return [...kept, ...d.added.filter((t) => !have.has(t.id))];
}
