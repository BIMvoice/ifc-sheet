/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A new version of the model replacing the loaded one, with the project kept.
 *
 * The project is filed under the loaded models' content hashes (`autosaveKey`), so a file
 * that differs by one wall is a model the project has never seen, and opening it starts an
 * empty project. While a swap is active the project follows the model instead: its sheets,
 * drawings and annotations stay, and it now refers to the new model (`project-sync.ts`).
 * Everything that finds a new version's differences (`whatchanged/`) starts from here.
 */

import { useProjectStore } from './project-store';
import type { ProjectModelRef } from './types';

let active = false;

/** The project is to survive the next model that loads, until `endModelVersionSwap`. */
export function beginModelVersionSwap(): void {
  active = true;
}

export function endModelVersionSwap(): void {
  active = false;
}

export const modelVersionSwapActive = (): boolean => active;

/** The project now refers to `models`, which replace the ones it knew. */
export function keepProjectForNewVersion(models: readonly ProjectModelRef[]): void {
  useProjectStore.setState({ models: [...models], dirty: true });
}
