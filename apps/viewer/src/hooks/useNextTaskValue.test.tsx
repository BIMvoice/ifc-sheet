/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect } from 'react';
import { create } from 'zustand';
import { cleanup, render } from '@/test/render.js';
import { laterTasksUntil, updateInThisTask } from '@/test/react-tasks.js';
import { useNextTaskValue } from './useNextTaskValue';

/** #154: the value a component computes from runs one task after the store update that changed it, newest value only. */

const useStore = create<{ v: string }>(() => ({ v: 'a' }));
afterEach(() => {
  cleanup();
  useStore.setState({ v: 'a' });
});

/** Records every value the component committed with, the store's and the settled one. */
function mount() {
  const seen: Array<[string, string]> = [];
  function Probe() {
    const v = useStore((s) => s.v);
    const settled = useNextTaskValue(v);
    useEffect(() => { seen.push([v, settled]); }, [v, settled]);
    return null;
  }
  render(<Probe />);
  return seen;
}

describe('useNextTaskValue', () => {
  it('starts from the value', () => {
    assert.deepEqual(mount()[0], ['a', 'a']);
  });

  it('gives a new value in a later task, not in the render that changed it', async () => {
    const seen = mount();
    await updateInThisTask(() => useStore.setState({ v: 'b' }));
    assert.deepEqual(seen.at(-1), ['b', 'a'], 'the render of the change still sees the old value');
    await laterTasksUntil(() => seen.at(-1)?.[1] === 'b');
    assert.deepEqual(seen.at(-1), ['b', 'b']);
  });

  it('turns changes made before that task into one update with the newest value', async () => {
    const seen = mount();
    await updateInThisTask(() => useStore.setState({ v: 'b' }));
    await updateInThisTask(() => useStore.setState({ v: 'c' }));
    await laterTasksUntil(() => seen.at(-1)?.[1] === 'c');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(seen.map(([, s]) => s).filter((s, i, all) => s !== all[i - 1]), ['a', 'c'], 'b is never settled, so nothing is computed from it');
  });
});
