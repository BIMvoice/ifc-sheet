/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A value handed on one browser task after it changes (#154): what a component computes from it then runs in a task of
 * its own instead of in the render that changed it.
 *
 * A Zustand update re-renders every subscriber in one synchronous render, so a model's arrival used to finish the 3D,
 * measure the building, read what the model lacks and lay the set out in one long task. A component that reads the
 * value through here re-renders cheaply in that render and does its own work in the next task.
 *
 * Not `useDeferredValue`: React throws a deferred render away and starts it again whenever a synchronous update lands
 * first, and the end of a load has many (the search index's progress, for one). A timer's update is rendered when its
 * task runs.
 *
 * Several changes before the task runs are one update, with the newest value. The first render sees the value itself,
 * so a component that mounts computes at once, as before.
 */

import { useEffect, useState } from 'react';

export function useNextTaskValue<T>(value: T): T {
  const [settled, setSettled] = useState(() => value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = setTimeout(() => setSettled(() => value), 0);
    return () => clearTimeout(timer);
  }, [value, settled]);
  return settled;
}
