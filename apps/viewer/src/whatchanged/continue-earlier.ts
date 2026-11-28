/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Continue the project of an earlier version of the model (#922): the model in front was opened in a fresh tab, saved
 * again by its authoring tool, so it has no autosave of its own (`project/earlier-project-store.ts` offers the earlier
 * one). The earlier project comes in front and is brought onto the new model the way Reload the IFC model does
 * (`reload.ts`, `version.ts`): the project now refers to the new model (`keepProjectForNewVersion`) and, when the
 * earlier project kept a model state, What changed compares the new model with it, so tags follow the elements that
 * moved and the annotations whose element is gone are counted. Without a kept state those are counted by GlobalId.
 * The earlier slot is read, never written: the project is autosaved under the new model's slot from here on.
 */

import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { readModelState } from '@/project/autosave-snapshots';
import { restoreRasters } from '@/project/autosave-rasters';
import { forgetEarlierProject, useEarlierProjectStore } from '@/project/earlier-project-store';
import { modelGlobalIds } from '@/project/model-guids';
import { keepProjectForNewVersion } from '@/project/model-version';
import { loadProjectDocument, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import { loadedModels } from '@/project/project-sync';
import { isAutomaticCloud } from '@/project/revisions';
import { setResult, useWhatChanged } from './baseline';
import { annotationsWithoutElement } from './impact';
import { runGuarded } from './run';

const t = (key: string, params: Record<string, string | number> = {}) => resolve(`earlierProject.${key}` as TranslationKey, params);

export interface ContinueOutcome {
  /** Elements that changed since the earlier project's model state; null when it kept none to compare with. */
  changed: number | null;
  /** Annotations kept whose element is no longer in the model. */
  lost: number;
}

/** Puts the offered project in front, on the model in front; null when nothing is on offer. */
export async function continueEarlierProject(): Promise<ContinueOutcome | null> {
  const { offer } = useEarlierProjectStore.getState();
  if (!offer) return null;
  forgetEarlierProject();
  const { refs, storeys } = loadedModels();
  loadProjectDocument(offer.doc, { dirty: true });
  keepProjectForNewVersion(refs);
  syncProjectWithModels(refs, storeys);
  void restoreRasters(offer.forKey, offer.key);
  const reference = await readModelState(offer.key);
  if (reference) {
    useProjectStore.setState({ modelState: reference });
    setResult(null);
    await runGuarded('compare', () => {});
    const { result } = useWhatChanged.getState();
    if (result) return { changed: result.changed, lost: result.lost ?? 0 };
  }
  // No state to compare with: an annotation has lost its element when the model has no element of its GlobalId. A level
  // mark may name its storey by name, which is no GlobalId.
  const guids = modelGlobalIds();
  const levelNames = new Set(useProjectStore.getState().levels.map((l) => l.name));
  const drafts = useProjectStore.getState().drafts.filter((d) => !isAutomaticCloud(d));
  const lost = annotationsWithoutElement(drafts, (g) => guids.has(g) || levelNames.has(g)).length;
  return { changed: null, lost };
}

/** The notice a Continue ends with. */
export function continueNotice(outcome: ContinueOutcome, projectName: string): string {
  const done = outcome.changed === null ? t('continued', { project: projectName }) : t('continuedChanged', { project: projectName, count: outcome.changed });
  return outcome.lost > 0 ? `${done} ${t('lost', { count: outcome.lost })}` : done;
}
