/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How many definitions of each kind a catalogue holds. One place for the
 * classic Library tab and the Wall's library panel, so both count the same.
 */

import { configuredFields } from '@/tagfields/tag-fields';
import { selectKinds, CATALOGUE_KINDS, type Catalogue, type CatalogueKind } from './catalogue-file';

/** The number of definitions of `kind` in `catalogue` (hatch patterns are counted by their `*NAME` headers). */
export function kindCount(catalogue: Catalogue, kind: CatalogueKind): number {
  const only = selectKinds(catalogue, new Set([kind]));
  if (kind === 'tagFields') return configuredFields(only.tagFields);
  return kind === 'hatchPatterns' ? (only.hatchPatterns.match(/^\*/gm) ?? []).length : (only[kind] as unknown[]).length;
}

/** The count of every kind, in the order `CATALOGUE_KINDS` lists them. */
export function kindCounts(catalogue: Catalogue): number[] {
  return CATALOGUE_KINDS.map((k) => kindCount(catalogue, k));
}
