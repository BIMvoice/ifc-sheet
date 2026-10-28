/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Store updates the way the browser sees them, outside `act()`, so a test can tell what React did in the task of the
 * update from what it left for a later task (#154). `act()` flushes every pending render, the deferred ones too, and so
 * hides exactly that difference.
 *
 * A Zustand update re-renders its subscribers synchronously (`useSyncExternalStore`), in a microtask of the task that
 * made it; a `useDeferredValue` render runs in a later task, scheduled by React's scheduler.
 */

const setActEnvironment = (on: boolean) => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: on });

/** Runs `update` outside `act()` and returns once the microtasks it queued have run, before any later task. */
export async function updateInThisTask(update: () => void): Promise<void> {
  setActEnvironment(false);
  try {
    update();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  } finally {
    setActEnvironment(true);
  }
}

/** Lets later tasks run until `done()` holds; throws after `ms`. */
export async function laterTasksUntil(done: () => boolean, ms = 5000): Promise<void> {
  setActEnvironment(false);
  try {
    const end = Date.now() + ms;
    while (!done()) {
      if (Date.now() > end) throw new Error('timed out waiting for a later task');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  } finally {
    setActEnvironment(true);
  }
}
