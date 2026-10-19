/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The autosave slot, and what to do with it when the same models are opened again.
 *
 * A slot newer than the last project file saved or opened for those models, and holding something
 * that file did not, is OFFERED (`planAutosave` → `recovery-store.ts` → the intro screen); anything
 * else is put back as it always was. Either way the slot is read through `parseProjectFile`, the
 * reader every project file goes through, so a slot from an older build is migrated the same way.
 */

import { withoutModelState, writeModelState } from './autosave-snapshots';
import { parseProjectFile, serializeProject } from './project-file';
import { projectFingerprint, readSavedMark } from './project-saved';
import type { ProjectDocument } from './types';

export interface Autosave {
  doc: ProjectDocument;
  /** Epoch milliseconds the slot was written. */
  savedAt: number;
}

export type AutosavePlan =
  | { kind: 'none' }
  | { kind: 'restore'; autosave: Autosave }
  | { kind: 'offer'; autosave: Autosave };

export function readAutosave(key: string, storage: Pick<Storage, 'getItem'> = localStorage): Autosave | null {
  try {
    const text = storage.getItem(key);
    if (!text) return null;
    const doc = parseProjectFile(text);
    const stamp = Date.parse(String((JSON.parse(text) as { savedAt?: unknown }).savedAt));
    return { doc, savedAt: Number.isFinite(stamp) ? stamp : 0 };
  } catch (err) {
    console.warn('[project] ignoring unreadable autosave', err);
    return null;
  }
}

export function writeAutosave(key: string, doc: ProjectDocument, storage: Pick<Storage, 'setItem'> = localStorage, now = new Date()): void {
  // The model state is far larger than the drawings: it is kept apart, so it cannot fill the slot.
  const { slim, modelState } = withoutModelState(doc);
  try {
    storage.setItem(key, serializeProject(slim, now));
  } catch (err) {
    console.warn('[project] autosave failed', err);
  }
  // Never written empty: a slot restored before its state has been read back must not erase it.
  if (modelState) void writeModelState(key, modelState);
}

/** Whether a slot written at `savedAt` holding `doc` is work the last project file does not have. */
export function isUnsavedWork(key: string, autosave: Autosave, storage?: Pick<Storage, 'getItem'>): boolean {
  const mark = readSavedMark(key, storage);
  if (!mark) return true;
  return autosave.savedAt > mark.at && projectFingerprint(autosave.doc) !== mark.fingerprint;
}

export function planAutosave(key: string, storage: Pick<Storage, 'getItem'> = localStorage): AutosavePlan {
  const autosave = readAutosave(key, storage);
  if (!autosave) return { kind: 'none' };
  return { kind: isUnsavedWork(key, autosave, storage) ? 'offer' : 'restore', autosave };
}
