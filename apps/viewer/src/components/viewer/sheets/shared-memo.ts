/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A memo shared by every component that draws the same drawing (#154): the
 * Wall's sheet, the sheet editor and its stepped preview each style and pen
 * a view's drawing, and opening a sheet used to redo all of it. Values are
 * held per drawing object (weakly, so a replaced drawing takes its values
 * with it) and per list of inputs, compared by identity like a `useMemo`.
 */

/** Entries kept per drawing: one per distinct set of inputs it is drawn with (a view at two scales). */
const PER_KEY = 4;

export type SharedMemo<V> = WeakMap<object, { deps: readonly unknown[]; value: V }[]>;

export function sharedMemo<V>(): SharedMemo<V> {
  return new WeakMap();
}

const same = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/** `compute()`, or what it returned before for `key` with the same `deps`. */
export function memoOn<V>(memo: SharedMemo<V>, key: object, deps: readonly unknown[], compute: () => V): V {
  const entries = memo.get(key);
  const hit = entries?.find((e) => same(e.deps, deps));
  if (hit) return hit.value;
  const value = compute();
  const next = [{ deps, value }, ...(entries ?? [])].slice(0, PER_KEY);
  memo.set(key, next);
  return value;
}
