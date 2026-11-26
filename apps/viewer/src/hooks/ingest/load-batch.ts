/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Files opened together are one batch (#863). They load one after the other (the WASM parser is not thread-safe), and
 * while they do the Wall lays no set out and starts no drawing: a small structural model opened with a large
 * architectural one used to get a set of the structure alone first, drawn and then thrown away when the architecture
 * arrived. When the last file has loaded, or failed (a failed file is named and the others go on), the batch is done
 * and the set is laid out once, from all of them. A single file is no batch and loads as it always did.
 */

import { create } from 'zustand';

export type BatchFileState = 'waiting' | 'loading' | 'loaded' | 'failed';

export interface BatchFile {
  name: string;
  /** Bytes. */
  size: number;
  state: BatchFileState;
}

export interface LoadBatch {
  files: readonly BatchFile[];
  /** Every file has loaded or failed. */
  done: boolean;
}

/** The batch loading now, or the last one (kept once done, so its failures can still be named); null before any. */
export const useLoadBatch = create<{ batch: LoadBatch | null }>(() => ({ batch: null }));

function setFile(index: number, state: BatchFileState): void {
  const batch = useLoadBatch.getState().batch;
  if (!batch) return;
  useLoadBatch.setState({ batch: { ...batch, files: batch.files.map((f, i) => (i === index ? { ...f, state } : f)) } });
}

/**
 * Load `files` one after the other through `addOne`, which answers the model id, or null when the file did not load.
 * Two files or more are a batch, announced in `useLoadBatch` for as long as they load; a file that throws or answers
 * null is marked failed and the next one goes on.
 */
export async function loadAsBatch(files: readonly File[], addOne: (file: File, index: number) => Promise<string | null>): Promise<void> {
  if (files.length < 2) {
    for (let i = 0; i < files.length; i++) await addOne(files[i], i);
    return;
  }
  useLoadBatch.setState({ batch: { files: files.map((f) => ({ name: f.name, size: f.size, state: 'waiting' })), done: false } });
  try {
    for (let i = 0; i < files.length; i++) {
      setFile(i, 'loading');
      let id: string | null = null;
      try {
        id = await addOne(files[i], i);
      } catch (error) {
        console.error(`[ifc-lite] ${files[i].name} did not load; the other files of the batch go on`, error);
      }
      setFile(i, id ? 'loaded' : 'failed');
    }
  } finally {
    const batch = useLoadBatch.getState().batch;
    if (batch) useLoadBatch.setState({ batch: { ...batch, done: true } });
  }
}

/** Whether a batch is still loading: no set is laid out and no view drawn until it is done. */
export function batchHolds(batch: LoadBatch | null): boolean {
  return batch !== null && !batch.done;
}
