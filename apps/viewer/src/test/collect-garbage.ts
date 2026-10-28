/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether a weakly held object is collected once nothing else holds it. The
 * runner is not started with `--expose-gc`, so the collector is taken from a
 * fresh context after switching the flag on; the object is given a few turns
 * of the event loop, as engines may keep a just-dropped value alive until
 * the stack that made it has unwound.
 */

import v8 from 'node:v8';
import vm from 'node:vm';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

export async function collected(ref: WeakRef<object>): Promise<boolean> {
  for (let turn = 0; turn < 10; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
    gc();
    if (ref.deref() === undefined) return true;
  }
  return false;
}
