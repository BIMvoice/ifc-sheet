/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The autosave slot, and what to do with it when the same models are opened again.
 *
 * Each set of models has an autosave slot, a session marker and, when there is one, a recoverable
 * slot. The marker is set while the models are open and cleared when the page closes as a page does
 * (`pagehide`) or other models replace them; finding it set at the next start means that session
 * died. Its autosave is then moved to the recoverable slot when it holds work the last project file
 * saved or opened for those models does not (or no file was ever saved), and OFFERED back
 * (`recovery-store.ts`). The recoverable slot is not written again, and not removed, until the user
 * answers Discard or a Restore has loaded it: going on without answering keeps it. Any other autosave
 * is put back as it always was. Every slot is read through `parseProjectFile`, the reader every
 * project file goes through, so a slot from an older build is migrated the same way.
 */

import { readModelState, withoutModelState, writeModelState } from './autosave-snapshots';
import { copyRasters, withoutRasters, writeRasters } from './autosave-rasters';
import { toast } from '@/components/ui/toast';
import { resolve } from '@/i18n/registry';
import { parseProjectFile, serializeProject } from './project-file';
import { AUTOSAVE_PREFIX, projectFingerprint, readSavedMark, safeStorage } from './project-saved';
import type { ProjectDocument } from './types';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Autosave {
  doc: ProjectDocument;
  /** Epoch milliseconds the slot was written. */
  savedAt: number;
}

export interface AutosavePlan {
  /** The autosave to put back as the project in front, if any. */
  restore: Autosave | null;
  /** The session kept in the recoverable slot, to offer, if any. */
  recoverable: Autosave | null;
}

const RECOVERABLE_PREFIX = 'ifc-lite:project-recoverable:v1:';
const SESSION_PREFIX = 'ifc-lite:project-session-open:v1:';

/** Where the session that died is kept for the autosave slot `key` until it is answered. */
export function recoverableKey(key: string): string {
  return RECOVERABLE_PREFIX + key.slice(AUTOSAVE_PREFIX.length);
}

const sessionKey = (key: string): string => SESSION_PREFIX + key.slice(AUTOSAVE_PREFIX.length);

export function readAutosave(key: string, storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Autosave | null {
  try {
    const text = storage?.getItem(key);
    if (!text) return null;
    const doc = parseProjectFile(text);
    const stamp = Date.parse(String((JSON.parse(text) as { savedAt?: unknown }).savedAt));
    return { doc, savedAt: Number.isFinite(stamp) ? stamp : 0 };
  } catch (err) {
    console.warn('[project] ignoring unreadable autosave', err);
    return null;
  }
}

/** One notice for every autosave failure, kept until dismissed: the drawings are not being saved. */
const AUTOSAVE_FAILED = 'project-autosave-failed';

/**
 * Writes the slot. The model state and the raster captures are far larger than
 * the drawings: they are kept apart, in IndexedDB, so they cannot fill it. A
 * write the browser refuses is said to the person, not only logged.
 */
export async function writeAutosave(key: string, doc: ProjectDocument, storage: Pick<Storage, 'setItem'> | undefined = safeStorage(), now = new Date()): Promise<void> {
  const { slim: noState, modelState } = withoutModelState(doc);
  const { slim, rasters } = withoutRasters(noState);
  try {
    storage?.setItem(key, serializeProject(slim, now));
  } catch (err) {
    console.warn('[project] autosave failed', err);
    toast.error(resolve('projectPackage.autosaveFailed', { detail: err instanceof Error ? err.message : String(err) }), AUTOSAVE_FAILED);
  }
  // Never written empty: a slot restored before its state has been read back must not erase it.
  const kept = await Promise.all([modelState ? writeModelState(key, modelState) : true, writeRasters(key, rasters)]);
  if (kept.includes(false)) toast.error(resolve('projectPackage.autosaveImagesFailed'), AUTOSAVE_FAILED);
}

/** Whether a slot written at `savedAt` holding `doc` is work the last project file does not have. */
export function isUnsavedWork(key: string, autosave: Autosave, storage?: Pick<Storage, 'getItem'>): boolean {
  const mark = readSavedMark(key, storage);
  if (!mark) return true;
  return autosave.savedAt > mark.at && projectFingerprint(autosave.doc) !== mark.fingerprint;
}

/** Notes that the models of slot `key` are open in this page. */
export function markSessionOpen(key: string, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(sessionKey(key), String(Date.now()));
  } catch (err) {
    console.warn('[project] could not note the open session', err);
  }
}

/** Notes that the session on slot `key` ended as it should (the page closed, or other models replaced these). */
export function markSessionClosed(key: string, storage: Pick<Storage, 'removeItem'> | undefined = safeStorage()): void {
  try {
    storage?.removeItem(sessionKey(key));
  } catch (err) {
    console.warn('[project] could not note the session closing', err);
  }
}

function lastSessionDied(key: string, storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(sessionKey(key)) !== null;
  } catch (err) {
    console.warn('[project] could not read the session marker', err);
    return false;
  }
}

/** Copies the autosave of `key` to its recoverable slot and empties the autosave; false when the copy could not be kept. */
function keepAsRecoverable(key: string, storage: Store): boolean {
  try {
    const text = storage.getItem(key);
    if (!text) return false;
    storage.setItem(recoverableKey(key), text);
    storage.removeItem(key);
  } catch (err) {
    console.warn('[project] could not keep the session that ended unexpectedly', err);
    return false;
  }
  void readModelState(key).then((state) => state && writeModelState(recoverableKey(key), state));
  return true;
}

/** What the start of a session on slot `key` finds. Read before `markSessionOpen` for this session. */
export function planAutosave(key: string, storage: Store | undefined = safeStorage()): AutosavePlan {
  if (!storage) return { restore: null, recoverable: null };
  const autosave = readAutosave(key, storage);
  const recoverable = readAutosave(recoverableKey(key), storage);
  if (!recoverable && autosave && lastSessionDied(key, storage) && isUnsavedWork(key, autosave, storage)) {
    // No copy kept, no offer: the work is put back in front rather than left for the next autosave to replace.
    if (keepAsRecoverable(key, storage)) {
      // Its captures too: the next session's autosave of the same views writes under the live slot.
      void copyRasters(key, recoverableKey(key), autosave.doc);
      return { restore: null, recoverable: autosave };
    }
  }
  return { restore: autosave, recoverable };
}

/** Removes the recoverable slot of `key` (Discard, or a Restore that loaded it); its model state is the caller's to remove. */
export function dropRecoverable(key: string, storage: Pick<Storage, 'removeItem'> | undefined = safeStorage()): void {
  try {
    storage?.removeItem(recoverableKey(key));
  } catch (err) {
    console.warn('[project] could not remove the recoverable session', err);
  }
}
