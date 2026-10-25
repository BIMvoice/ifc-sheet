/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether a file is the next version of the model the open project is drawn from.
 *
 * Two IFC files are versions of one model when they carry the same IfcProject GlobalId: an authoring
 * tool keeps it across revisions, and a different building has another. The loaded model's is read from
 * its parsed data; the candidate's is read from the file's text before anything is loaded, so the
 * question can be asked while the project is still the one in front.
 */

import type { FederatedModel } from '@/store/types';

interface ProjectSource {
  entityIndex?: { byType: ReadonlyMap<string, readonly number[]> } | null;
  entities: { getGlobalId(id: number): string };
}

/** The IfcProject GlobalId of a parsed model; null when it has none. */
export function projectGuidOfStore(store: ProjectSource | null | undefined): string | null {
  const id = store?.entityIndex?.byType.get('IFCPROJECT')?.[0];
  if (id === undefined) return null;
  return store!.entities.getGlobalId(id) || null;
}

const PROJECT_RECORD = /IFCPROJECT\s*\(\s*'([^']+)'/i;
const CHUNK = 1 << 20;
/** The longest `IFCPROJECT('<guid>'` can be, with generous spacing: what one chunk hands the next. */
const OVERLAP = 96;

/** The IfcProject GlobalId written in an IFC file's text, read a chunk at a time; null when there is none. */
export async function scanIfcProjectGuid(file: Blob, chunk = CHUNK): Promise<string | null> {
  let carry = '';
  for (let at = 0; at < file.size; at += chunk) {
    const text = carry + await file.slice(at, at + chunk).text();
    const found = PROJECT_RECORD.exec(text);
    if (found) return found[1];
    carry = text.slice(-OVERLAP);
  }
  return null;
}

type LoadedModel = Pick<FederatedModel, 'name' | 'fileSize' | 'ifcDataStore'>;

/**
 * The model that `file` is the next version of: the one loaded model, when the file is an IFC with its
 * IfcProject GlobalId and not the very file that is loaded. Null otherwise, and for a federation, where
 * which model a file replaces is not a guess to make.
 */
export async function versionOfLoadedModel(file: File, models: readonly LoadedModel[]): Promise<LoadedModel | null> {
  if (models.length !== 1 || !/\.ifc$/i.test(file.name)) return null;
  const [loaded] = models;
  if (loaded.name === file.name && loaded.fileSize === file.size) return null;
  const loadedGuid = projectGuidOfStore(loaded.ifcDataStore as unknown as ProjectSource | null);
  if (!loadedGuid) return null;
  return (await scanIfcProjectGuid(file)) === loadedGuid ? loaded : null;
}
