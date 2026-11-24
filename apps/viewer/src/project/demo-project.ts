/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the demo project (`DEMO_MODEL`, the "Bloc P+4" block of flats) starts with besides its model: the building
 * materials its walls and floor slabs are made of, each with the hatch it draws where a plan or section cuts it (#850).
 *
 * An element of one material is hatched only by its row in the project's materials table (`materialResolver`), so a
 * demo with no rows drew every cut plain grey and showed nothing of the feature. These rows are an ordinary start: they
 * are listed under Building materials in the Project drawer, the user changes or removes them there, and the project
 * saves them like any other. A project restored from its autosave keeps what the user left.
 *
 * The names are the IfcMaterial names `tools/bloc-p4/derive-materials.mjs` writes into the sample.
 */

import type { ProjectMaterial } from '@bimvoice/ifcsheet/materials';
import { DEMO_MODEL } from '@/components/viewer/ifcsheet/demo-model';
import type { ProjectModelRef } from './types';

export const DEMO_MATERIALS: readonly ProjectMaterial[] = [
  { id: 'demo:reinforced-concrete', name: 'Reinforced concrete', hatch: 'CONCRETE', hatchScale: 1, hatchPen: 'hairline' },
  { id: 'demo:brick-masonry', name: 'Brick masonry (zidărie de cărămidă)', hatch: 'BRICKCUT', hatchScale: 1, hatchPen: 'hairline' },
  // The lighter block of the partitions: the same masonry cut, its lines twice as far apart.
  { id: 'demo:aac-block-masonry', name: 'AAC block masonry (zidărie BCA)', hatch: 'BRICKCUT', hatchScale: 2, hatchPen: 'hairline' },
];

/** The materials a new project on `models` starts with: the demo's for the demo model alone, none for any other. */
export function startingMaterials(models: readonly ProjectModelRef[]): ProjectMaterial[] | undefined {
  return models.length === 1 && models[0].name === DEMO_MODEL.name ? DEMO_MATERIALS.map((m) => ({ ...m })) : undefined;
}
