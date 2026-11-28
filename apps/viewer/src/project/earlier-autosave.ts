/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The autosave of an earlier version of the loaded model (#922). The autosave is filed under the model file's content
 * hash (`autosaveKey`), so the same IFC saved again in its authoring tool and opened in a fresh tab finds no autosave
 * and starts an empty project. Beside each slot its models' identity is now kept: the IfcProject GlobalId (an authoring
 * tool keeps it across revisions, `model-identity.ts`) and the file name of each model. A slot whose identity is the
 * same as the models in front, under another hash, is the project of an earlier version: it is offered, never loaded
 * or written over without the person choosing.
 *
 * A slot written before identities were kept has none. It is matched only when its models have the same file names
 * AND one of its plan views is drawn on an IfcBuildingStorey GlobalId the loaded models have: a file name alone ("model.ifc")
 * does not tell two buildings apart, a storey GlobalId does. Pure but for the storage handed in.
 */

import { AUTOSAVE_PREFIX, safeStorage } from './project-saved';
import { readAutosave, type Autosave } from './recovery';

const IDENTITY_PREFIX = 'ifc-lite:project-identity:v1:';

/** One loaded model as an earlier version of it is recognised by. */
export interface ModelIdentity {
  /** The IfcProject GlobalId. */
  projectGlobalId: string;
  /** The file name the model was opened from. */
  name: string;
}

export interface EarlierAutosave extends Autosave {
  /** The autosave slot it is kept in (never written by the offer). */
  key: string;
}

const identityKey = (key: string): string => IDENTITY_PREFIX + key.slice(AUTOSAVE_PREFIX.length);

const signature = (models: readonly { name: string; projectGlobalId?: string }[]): string =>
  models.map((m) => `${m.projectGlobalId ?? ''}\u0000${m.name}`).sort().join('\u0001');

/** Notes beside slot `key` which models it is for. Never throws: without it, that slot is just not offered later. */
export function noteSlotIdentity(key: string, models: readonly ModelIdentity[], storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(identityKey(key), JSON.stringify({ models }));
  } catch (err) {
    console.warn('[project] could not note which models the autosave is for', err);
  }
}

/** The identity noted beside slot `key`; null when none was noted (an older build) or it cannot be read. */
export function readSlotIdentity(key: string, storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): ModelIdentity[] | null {
  try {
    const text = storage?.getItem(identityKey(key));
    if (!text) return null;
    const models = (JSON.parse(text) as { models?: unknown }).models;
    if (!Array.isArray(models)) return null;
    const valid = models.filter((m): m is ModelIdentity => typeof m?.projectGlobalId === 'string' && typeof m?.name === 'string');
    return valid.length === models.length && valid.length > 0 ? valid : null;
  } catch (err) {
    console.warn('[project] ignoring an unreadable autosave identity', err);
    return null;
  }
}

/** Whether a slot without an identity is safely the project of these models: the same file names and a storey GlobalId in common. */
function legacyMatch(autosave: Autosave, models: readonly ModelIdentity[], storeyGlobalIds: ReadonlySet<string>): boolean {
  if (signature(autosave.doc.models) !== signature(models.map((m) => ({ name: m.name })))) return false;
  // Levels are not saved (they come from the models); a plan view keeps the level it was drawn on, storeys and all.
  return autosave.doc.views.some((v) => 'level' in v && (v.level?.storeyGlobalIds ?? []).some((g) => storeyGlobalIds.has(g)));
}

/**
 * The most recent autosave, other than slot `key`'s own, that was made from an earlier version of `models`; null when
 * there is none. `storeyGlobalIds` are the loaded models' IfcBuildingStorey GlobalIds (for slots without an identity).
 */
export function findEarlierAutosave(
  key: string,
  models: readonly ModelIdentity[],
  storeyGlobalIds: ReadonlySet<string>,
  storage: Pick<Storage, 'getItem' | 'key' | 'length'> | undefined = safeStorage(),
): EarlierAutosave | null {
  if (!storage || models.length === 0) return null;
  const wanted = signature(models);
  let best: EarlierAutosave | null = null;
  let slots: string[];
  try {
    slots = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => !!k && k.startsWith(AUTOSAVE_PREFIX) && k !== key);
  } catch (err) {
    console.warn('[project] could not list the autosaves', err);
    return null;
  }
  for (const slot of slots) {
    const identity = readSlotIdentity(slot, storage);
    if (identity && signature(identity) !== wanted) continue;
    const autosave = readAutosave(slot, storage);
    if (!autosave) continue;
    if (!identity && !legacyMatch(autosave, models, storeyGlobalIds)) continue;
    if (!best || autosave.savedAt > best.savedAt) best = { ...autosave, key: slot };
  }
  return best;
}
