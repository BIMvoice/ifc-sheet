/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the autosave keeps the model snapshots (`whatchanged/snapshot.ts`).
 * The autosave is one localStorage entry per set of models, and localStorage
 * holds about 5 MB for the whole site: a snapshot is some 130 bytes an element
 * (6.5 MB at 50 000), so it would fill the slot and take the drawings'
 * autosave with it. The slot holds the project WITHOUT its snapshots; they go
 * to IndexedDB, under the same key, and come back after the slot is read.
 * The project file and a package carry them as they are.
 */

import type { ProjectDocument } from './types';
import type { ModelSnapshot } from '@/whatchanged/snapshot';

export interface DocumentSnapshots {
  modelState?: ModelSnapshot;
  /** An issue's snapshot, by the issue's id. */
  issues: Record<string, ModelSnapshot>;
}

/** The document as the autosave slot holds it, and the snapshots it left out. */
export function withoutSnapshots(doc: ProjectDocument): { slim: ProjectDocument; snapshots: DocumentSnapshots } {
  const snapshots: DocumentSnapshots = { ...(doc.modelState ? { modelState: doc.modelState } : {}), issues: {} };
  const issues = doc.issues?.map((issue) => {
    if (!issue.model) return issue;
    snapshots.issues[issue.id] = issue.model;
    const { model: _model, ...rest } = issue;
    return rest;
  });
  const { modelState: _state, ...rest } = doc;
  return { slim: { ...rest, ...(issues ? { issues } : {}) }, snapshots };
}

/** `doc` with the snapshots put back where they were left out of. */
export function withSnapshots(doc: ProjectDocument, snapshots: DocumentSnapshots): ProjectDocument {
  return {
    ...doc,
    ...(snapshots.modelState && !doc.modelState ? { modelState: snapshots.modelState } : {}),
    ...(doc.issues ? { issues: doc.issues.map((i) => (snapshots.issues[i.id] && !i.model ? { ...i, model: snapshots.issues[i.id] } : i)) } : {}),
  };
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

/** Keeps the snapshots under `key`; false (with the reason in the console) when the browser would not take them. */
export async function writeSnapshots(key: string, snapshots: DocumentSnapshots): Promise<boolean> {
  try {
    if (!snapshots.modelState && Object.keys(snapshots.issues).length === 0) await run('readwrite', (s) => s.delete(key));
    else await run('readwrite', (s) => s.put(snapshots, key));
    return true;
  } catch (err) {
    console.warn('[project] the model state could not be kept for the autosave', err);
    return false;
  }
}

/** The snapshots kept under `key`, or none. */
export async function readSnapshots(key: string): Promise<DocumentSnapshots | null> {
  try {
    return (await run<DocumentSnapshots | undefined>('readonly', (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}
