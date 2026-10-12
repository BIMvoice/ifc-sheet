/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's catalogue as store actions: read it out of the project,
 * export it to a `.bvlib` file, import a file under a clash policy.
 */

import { downloadFile, sanitizeFilename } from '@/lib/export/download.js';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { commitStandards } from '@/project/drafting-standards';
import { useProjectStore, type ProjectState } from '@/project/project-store';
import { CATALOGUE_FILE_SUFFIX, parseCatalogue, selectKinds, serializeCatalogue, type Catalogue, type CatalogueKind } from './catalogue-file';
import { mergeCatalogues, type ClashPolicy, type MergeReport } from './catalogue-merge';

/** The reusable definitions the project holds right now. */
export function projectCatalogue(s: ProjectState = useProjectStore.getState()): Catalogue {
  return {
    layers: s.draftLayers, layerGroups: s.layerGroups ?? [],
    textStyles: s.textStyles?.length ? s.textStyles : [DEFAULT_TEXT_STYLE], dimStyles: s.dimStyles?.length ? s.dimStyles : [DEFAULT_DIM_STYLE],
    hatchPatterns: s.hatchPatterns ?? '', materials: s.materials ?? [],
    annotationTypes: s.annotationTypes ?? [], symbols: s.symbols ?? [], legends: s.legends ?? [],
  };
}

/** Write a catalogue into the project (styles first, so annotation heights are re-fitted in the same step). */
export function applyCatalogue(c: Catalogue): void {
  commitStandards({
    draftLayers: c.layers.length > 0 ? c.layers : useProjectStore.getState().draftLayers,
    layerGroups: c.layerGroups, textStyles: c.textStyles, dimStyles: c.dimStyles, hatchPatterns: c.hatchPatterns,
    materials: c.materials, annotationTypes: c.annotationTypes, symbols: c.symbols, legends: c.legends,
  });
}

export function exportCatalogue(kinds: ReadonlySet<CatalogueKind>, name = useProjectStore.getState().name): void {
  const text = serializeCatalogue(selectKinds(projectCatalogue(), kinds), name);
  downloadFile(text, `${sanitizeFilename(name, { fallback: 'catalogue' })}${CATALOGUE_FILE_SUFFIX}`, 'application/json');
}

/** Import a catalogue file's text into the project. Throws, changing nothing, when the file is not a readable catalogue. */
export function importCatalogueText(text: string, policy: ClashPolicy): { name: string; report: MergeReport } {
  const { name, catalogue } = parseCatalogue(text);
  const { catalogue: merged, report } = mergeCatalogues(projectCatalogue(), catalogue, policy);
  applyCatalogue(merged);
  return { name, report };
}
