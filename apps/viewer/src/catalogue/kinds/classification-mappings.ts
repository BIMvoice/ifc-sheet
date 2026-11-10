/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/**
 * The classification mappings (#89) as a library kind: the office's table of codes, merged one mapping per system
 * (`../classification-merge.ts`) and written back to the project as the whole list.
 */
import { readClassificationMapping, type ClassificationMapping } from '@bimvoice/ifcsheet';
import { mergeClassificationMappings } from '../classification-merge';
import { fail, readList } from '../readers';
import { defineCatalogueKind } from '../registered-kinds';

declare module '../registered-kinds' {
  interface RegisteredCatalogueData { classificationMappings: ClassificationMapping[] }
}

export const registeredCatalogueKinds = [
  defineCatalogueKind({
    key: 'classificationMappings',
    empty: () => [],
    read: (file, what) => readList(file, 'classificationMappings', (v, p) => readClassificationMapping(v) ?? fail(p, 'must be a classification mapping { id, system: { name }, rules }', what), what),
    merge: mergeClassificationMappings,
    fromProject: (s) => s.classificationMappings ?? [],
    applyToProject: (s, items) => (items !== (s.classificationMappings ?? []) ? { classificationMappings: items } : undefined),
  }),
];
