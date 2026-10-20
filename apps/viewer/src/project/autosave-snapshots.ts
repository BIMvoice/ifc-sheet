/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the autosave keeps the model state (`whatchanged/snapshot.ts`). The autosave is one
 * localStorage entry per set of models, and localStorage holds about 5 MB for the whole site:
 * the state is some 130 bytes an element (6.5 MB at 50 000), so it would fill the slot and take
 * the drawings' autosave with it. The slot holds the project WITHOUT the state; the state goes
 * to IndexedDB, under the same key, and comes back after the slot is read. The project file and
 * a package carry it as it is.
 */

import type { ModelSnapshot } from '@/whatchanged/snapshot';
import type { ProjectDocument } from './types';

/** The document as the autosave slot holds it, and the state it left out. */
export function withoutModelState(doc: ProjectDocument): { slim: ProjectDocument; modelState?: ModelSnapshot } {
  const { modelState, ...slim } = doc;
  return { slim, ...(modelState ? { modelState } : {}) };
}

const DB_NAME = 'ifcsheet-autosave-snapshots';
const STORE = 'snapshots';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

/** Keeps the state under `key`; false, with the reason in the console, when the browser would not take it. */
export async function writeModelState(key: string, modelState: ModelSnapshot): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(modelState, key));
    return true;
  } catch (err) {
    console.warn('[project] the model state could not be kept for the autosave', err);
    return false;
  }
}

/** The state kept under `key`, or none. */
export async function readModelState(key: string): Promise<ModelSnapshot | null> {
  try {
    return (await run<ModelSnapshot | undefined>('readonly', (s) => s.get(key))) ?? null;
  } catch (err) {
    console.warn('[project] the kept model state could not be read', err);
    return null;
  }
}

/** Removes the state kept under `key`. */
export async function deleteModelState(key: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(key));
  } catch (err) {
    console.warn('[project] the kept model state could not be removed', err);
  }
}
