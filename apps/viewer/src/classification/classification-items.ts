/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the editor lists to map (#89): the classes, types and materials of the loaded models.
 */

import { collectTypeElements } from '@/joinery/type-quantities-models';
import { classNamesInModels } from '@/project/model-classes';
import { materialNamesInModels } from '@/project/materials';
import { totalClassOf } from '@bimvoice/ifcsheet';

/** What the loaded models hold that a rule can name. A type carries the IFC class of its elements, for the bulk assignment by class. */
export interface ModelItems {
  classes: string[];
  types: { name: string; className: string }[];
  materials: string[];
}

export function modelItems(): ModelItems {
  const types = new Map<string, string>();
  for (const e of collectTypeElements()) if (e.typeName && !types.has(e.typeName)) types.set(e.typeName, totalClassOf(e.className));
  return {
    classes: classNamesInModels(),
    types: [...types].map(([name, className]) => ({ name, className })).sort((a, b) => a.name.localeCompare(b.name)),
    materials: materialNamesInModels(),
  };
}
