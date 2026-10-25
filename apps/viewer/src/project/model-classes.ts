/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The IFC classes the loaded models hold (#31): what a view template can map. Elements and spaces only, the classes a drawing draws,
 * named as the schema spells them (`IfcWallStandardCase`), sorted. The materials are `materialNamesInModels()`.
 */

import { getInheritanceChainAcrossSchemas, isQueryableObjectType, normalizeIfcTypeName } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';

const drawn = (type: string): boolean => {
  if (!isQueryableObjectType(type)) return false;
  const chain = getInheritanceChainAcrossSchemas(type);
  return chain.includes('IfcElement') || chain.includes('IfcSpace');
};

export function classNamesInModels(): string[] {
  const names = new Set<string>();
  for (const model of useViewerStore.getState().models.values()) {
    for (const [type, ids] of model.ifcDataStore?.entityIndex?.byType ?? []) {
      if (ids.length === 0) continue;
      const name = normalizeIfcTypeName(type);
      if (drawn(name)) names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
