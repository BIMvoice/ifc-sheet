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
 * project file goes through, so a slot from an older build is migrated the same way. A slot from a
 * NEWER build is neither loaded nor written: the plan says so (`tooNew`), the sync stops autosaving
 * to it for the session and tells the person (`autosave-notice.ts`). A write the browser refuses is
 * told to the person too, not only logged.
 */

import { readModelState, withoutModelState, writeModelState } from './autosave-snapshots';
import { noticeAutosaveFailed } from './autosave-notice';
import { parseProjectFile, serializeProject } from './project-file';
import { ProjectFileTooNewError } from './project-migrations';
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
  /** The autosave slot was written by a newer build: it is left as it is, and must not be autosaved over. */
  tooNew: boolean;
}

const RECOVERABLE_PREFIX = 'ifc-lite:project-recoverable:v1:';
const SESSION_PREFIX = 'ifc-lite:project-session-open:v1:';

/** Where the session that died is kept for the autosave slot `key` until it is answered. */
export function recoverableKey(key: string): string {
  return RECOVERABLE_PREFIX + key.slice(AUTOSAVE_PREFIX.length);
}

const sessionKey = (key: string): string => SESSION_PREFIX + key.slice(AUTOSAVE_PREFIX.length);

/** A slot as read: its autosave, or none; `tooNew` when it holds a project from a newer build (which is not none). */
function readSlot(key: string, storage: Pick<Storage, 'getItem'> | undefined): { autosave: Autosave | null; tooNew: boolean } {
  try {
    const text = storage?.getItem(key);
    if (!text) return { autosave: null, tooNew: false };
    const doc = parseProjectFile(text);
    const stamp = Date.parse(String((JSON.parse(text) as { savedAt?: unknown }).savedAt));
    return { autosave: { doc, savedAt: Number.isFinite(stamp) ? stamp : 0 }, tooNew: false };
  } catch (err) {
    if (err instanceof ProjectFileTooNewError) {
      console.warn('[project] the autosave was written by a newer version; leaving it as it is', err);
      return { autosave: null, tooNew: true };
    }
    console.warn('[project] ignoring unreadable autosave', err);
    return { autosave: null, tooNew: false };
  }
}

export function readAutosave(key: string, storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Autosave | null {
  return readSlot(key, storage).autosave;
}

export function writeAutosave(key: string, doc: ProjectDocument, storage: Pick<Storage, 'setItem'> | undefined = safeStorage(), now = new Date()): void {
  // The model state is far larger than the drawings: it is kept apart, so it cannot fill the slot.
  const { slim, modelState } = withoutModelState(doc);
  try {
    storage?.setItem(key, serializeProject(slim, now));
  } catch (err) {
    // The slot keeps its older copy: said on screen, so it is not mistaken for the current work.
    console.warn('[project] autosave failed', err);
    noticeAutosaveFailed(err);
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
  if (!storage) return { restore: null, recoverable: null, tooNew: false };
  const slot = readSlot(key, storage);
  const kept = readSlot(recoverableKey(key), storage);
  const recoverable = kept.autosave;
  // A newer build's autosave: nothing is restored from it, moved, or written over it.
  if (slot.tooNew) return { restore: null, recoverable, tooNew: true };
  const autosave = slot.autosave;
  // A newer build's kept session counts as kept: it is not replaced, only not offered.
  if (!recoverable && !kept.tooNew && autosave && lastSessionDied(key, storage) && isUnsavedWork(key, autosave, storage)) {
    // No copy kept, no offer: the work is put back in front rather than left for the next autosave to replace.
    if (keepAsRecoverable(key, storage)) return { restore: null, recoverable: autosave, tooNew: false };
  }
  return { restore: autosave, recoverable, tooNew: false };
}

/** Removes the recoverable slot of `key` (Discard, or a Restore that loaded it); its model state is the caller's to remove. */
export function dropRecoverable(key: string, storage: Pick<Storage, 'removeItem'> | undefined = safeStorage()): void {
  try {
    storage?.removeItem(recoverableKey(key));
  } catch (err) {
    console.warn('[project] could not remove the recoverable session', err);
  }
}
