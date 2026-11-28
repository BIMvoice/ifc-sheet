/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reload the IFC model (#922): the file the open project is drawn from, saved again by its authoring tool (Bonsai
 * keeps every GlobalId), replaces the loaded model, and the project stays. Its sheets, views and annotations are kept
 * and drawn on the new model; tags and labels of elements that moved follow them, and annotations whose element the
 * new version no longer has are kept and counted, never dropped.
 *
 * Without this the project is filed under the loaded file's content hash (`project-sync.ts`, `autosaveKey`), so the
 * same file saved again is a model the project has never seen and the project in front is replaced by an empty one.
 * The file is loaded as the next version of the model instead (`loadNewVersion`), through `load`, the viewer's one
 * loader (`useIfcLoader.loadFile`). The same answer for the ribbon's Refresh, the project drawer and RELOADMODEL.
 */

import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { useViewerStore } from '@/store';
import { setResult, useWhatChanged } from './baseline';
import { loadNewVersion } from './version';

const t = (key: string, params: Record<string, string | number> = {}) => resolve(`modelReload.${key}` as TranslationKey, params);

export interface ReloadOutcome {
  /** Elements of the model that changed. */
  changed: number;
  /** Annotations kept whose element is no longer in the model. */
  lost: number;
}

/** Why a reload cannot start, in words; null when it can. A federation is refreshed model by model, not reloaded as one. */
export function reloadRefusal(): string | null {
  const { models, loading } = useViewerStore.getState();
  if (loading) return t('busy');
  if (models.size === 0) return t('noModel');
  if (models.size > 1) return t('federation');
  return null;
}

/** Replace the loaded model with `file`, keeping the open project; resolves once the new model is drawn and compared. */
export async function reloadModel(file: File, load: (file: File) => Promise<void>): Promise<ReloadOutcome> {
  const refused = reloadRefusal();
  if (refused) throw new Error(refused);
  // What an earlier comparison found is not what this reload changed.
  setResult(null);
  await loadNewVersion(file, load, () => {});
  const { result, message } = useWhatChanged.getState();
  // The comparison says its own failure, and keeps it; the model is in, so that is reported, not thrown.
  if (!result) throw new Error(message ?? t('notCompared'));
  return { changed: result.changed, lost: result.lost ?? 0 };
}

/** The short notice a reload ends with: the project is kept, what changed, and how many annotations lost their element. */
export function reloadNotice(outcome: ReloadOutcome, fileName: string): string {
  const done = t('done', { file: fileName, count: outcome.changed });
  return outcome.lost > 0 ? `${done} ${t('lost', { count: outcome.lost })}` : done;
}
