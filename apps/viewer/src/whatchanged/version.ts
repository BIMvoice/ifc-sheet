/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A new version of the model into the project: the reference is recorded from the model that is loaded (when
 * the project has none), the new file replaces the model with the project kept (`project/model-version.ts`),
 * and when the new model has been read and drawn the comparison runs. `load` is the viewer's one loader.
 */

import { beginModelVersionSwap, endModelVersionSwap } from '@/project/model-version';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { currentSnapshot } from './current';
import { runGuarded } from './run';

/** Resolves when the models are read and drawn; rejects with the load's error, or when it takes longer than `timeoutMs`. */
export function whenModelReady(timeoutMs = 10 * 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let unsubscribe = (): void => {};
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('the model took too long to load')); }, timeoutMs);
    const settle = (state = useViewerStore.getState()): void => {
      if (state.error !== null) { clearTimeout(timer); unsubscribe(); reject(new Error(state.error)); return; }
      if (state.loading || state.geometryStreamingActive || state.models.size === 0) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    unsubscribe = useViewerStore.subscribe(settle);
    settle();
  });
}

/** The reference, recorded from the loaded model when the project has none. False when there is no model to record. */
async function ensureReference(): Promise<boolean> {
  if (useProjectStore.getState().modelState) return true;
  const current = await currentSnapshot();
  if (!current) return false;
  useProjectStore.setState({ modelState: current, dirty: true });
  return true;
}

export async function loadNewVersion(file: File, load: (file: File) => Promise<void>, say: (text: string) => void): Promise<void> {
  if (!(await ensureReference())) throw new Error('there is no model loaded to compare the new version with');
  beginModelVersionSwap();
  try {
    await load(file);
    await whenModelReady();
  } finally {
    endModelVersionSwap();
  }
  await runGuarded('compare', say);
}
