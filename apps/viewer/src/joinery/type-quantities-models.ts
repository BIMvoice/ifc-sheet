/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into the quantities by type (#581): the rule is the engine's (`typeElementsOf` and `typeQuantitiesOver`, the
 * ones `ifcsheet build --project` reads with); the app only says which models, with their edit overlay and the live renderer's
 * instanced pieces (`loadedScheduleModels`), and which classification mappings the project holds.
 */

import type { ClassificationMapping, ScheduleClassification, TypeElement, TypeQuantities } from '@bimvoice/ifcsheet';
import { typeElementsOf, typeQuantitiesOver, type ScheduleModel } from '@bimvoice/ifcsheet/project';
import { useProjectStore } from '@/project/project-store';
import { loadedScheduleModels } from './schedule-models';

/** The elements of `models` (default: the loaded, visible ones); with `mappings`, each carries its classification (#89). */
export function collectTypeElements(models: readonly ScheduleModel[] = loadedScheduleModels(), mappings?: readonly ClassificationMapping[]): TypeElement[] {
  return typeElementsOf(models, mappings ? { mappings } : undefined);
}

/** The quantities by type for a schedule's classification choice (#89), over the loaded models and the project's mappings. */
export function typeQuantitiesOf(choice?: ScheduleClassification): TypeQuantities {
  return typeQuantitiesOver(loadedScheduleModels(), useProjectStore.getState().classificationMappings, choice);
}
