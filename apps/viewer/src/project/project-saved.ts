/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * When a project was last written to, or read from, a project file, and what it held then.
 *
 * The autosave slot is one per set of loaded models (`autosaveKey`); beside it the last save or
 * open of a file is noted under the same key, with a fingerprint of the project at that moment.
 * `recovery.ts` compares the two: an autosave is worth offering back only when it is newer than
 * the file AND holds something the file did not (the autosave that follows a file being opened
 * is written later but holds the same).
 */

import { withoutModelState } from './autosave-snapshots';
import type { ProjectDocument, ProjectModelRef } from './types';

export const AUTOSAVE_PREFIX = 'ifc-lite:project:v1:';
const SAVED_PREFIX = 'ifc-lite:project-file:v1:';

/** The autosave slot for a set of loaded models (order-independent). */
export function autosaveKey(models: readonly ProjectModelRef[]): string {
  return AUTOSAVE_PREFIX + models.map((m) => m.key).sort().join('|');
}

/** What the project holds, as a short string: the same project gives the same one (FNV-1a over its JSON, model state left out). */
export function projectFingerprint(doc: ProjectDocument): string {
  const text = JSON.stringify(withoutModelState(doc).slim);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

/** Where the note for the autosave slot `key` is kept. */
function savedKey(key: string): string {
  return SAVED_PREFIX + key.slice(AUTOSAVE_PREFIX.length);
}

export interface SavedMark {
  /** Epoch milliseconds of the save or open. */
  at: number;
  fingerprint: string;
}

/** Notes that `doc` is what a project file holds now. Never throws: a browser that will not keep it just offers more. */
export function markProjectSaved(doc: ProjectDocument, now: number = Date.now(), storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  const mark: SavedMark = { at: now, fingerprint: projectFingerprint(doc) };
  try {
    storage?.setItem(savedKey(autosaveKey(doc.models)), JSON.stringify(mark));
  } catch (err) {
    console.warn('[project] could not note the project file save', err);
  }
}

export function readSavedMark(key: string, storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): SavedMark | null {
  try {
    const text = storage?.getItem(savedKey(key));
    if (!text) return null;
    const v = JSON.parse(text) as Partial<SavedMark>;
    return typeof v.at === 'number' && typeof v.fingerprint === 'string' ? { at: v.at, fingerprint: v.fingerprint } : null;
  } catch (err) {
    console.warn('[project] ignoring an unreadable project file note', err);
    return null;
  }
}

/** localStorage, or none where the browser refuses it (reading the property itself can throw). */
export function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch (err) {
    console.warn('[project] localStorage is not available', err);
    return undefined;
  }
}
