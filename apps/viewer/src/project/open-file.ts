/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Opening a model file while a project is open. A file that is the next version of the loaded model
 * (`model-identity.ts`) is offered as an update of the same project, so its sheets, drawings and
 * annotations stay and what changed is reported (`whatchanged/version.ts`); declining, or any other
 * file, opens as it always did.
 */

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { useProjectStore } from './project-store';
import { versionOfLoadedModel } from './model-identity';
import type { FederatedModel } from '@/store/types';

const t = (key: string, params: Record<string, string | number> = {}) => resolve(`whatchanged.${key}` as TranslationKey, params);

export interface OpenSeams {
  models: () => readonly Pick<FederatedModel, 'name' | 'fileSize' | 'ifcDataStore'>[];
  ask: (description: string, confirmLabel: string) => Promise<boolean>;
  /** The ordinary open: the project follows the file's own models. */
  open: (file: File) => void | Promise<void>;
  /** Load the file as the next version of the model, with the project kept; compares when it is read. */
  update: (file: File) => Promise<void>;
  /** Called with the reason when the update could not be done. */
  failed: (reason: string) => void;
  /** Called once the update is in, to show what changed. */
  updated: () => void;
}

/** Open one file: offered as an update of the open project when it is the next version of the model in it. */
export async function openFileForProject(file: File, seams: OpenSeams): Promise<void> {
  const hasProject = useProjectStore.getState().models.length > 0;
  const loaded = hasProject ? await versionOfLoadedModel(file, seams.models()).catch(() => null) : null;
  if (!loaded) { await seams.open(file); return; }
  const yes = await seams.ask(t('offer.description', { old: loaded.name, file: file.name }), t('offer.update'));
  if (!yes) { await seams.open(file); return; }
  try {
    await seams.update(file);
    seams.updated();
  } catch (err) {
    seams.failed(err instanceof Error ? err.message : String(err));
  }
}

export const askInDialog = (description: string, confirmLabel: string): Promise<boolean> =>
  confirmDialog({ title: t('offer.title'), description, confirmLabel });
