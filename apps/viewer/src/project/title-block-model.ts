/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded model as the title block reads it (`ModelFacts`), and what every
 * sheet prints for the project: typed values over the mapped ones. Names,
 * descriptions and properties are read the way the labels read them
 * (`labels/label-element.ts`), so an edit in the Properties panel shows on
 * the sheets; the rest (address, OwnerHistory, actors) is read from the
 * record, which carries references the label reader leaves out.
 */

import { useMemo } from 'react';
import type { IfcDataStore } from '@ifc-lite/parser';
import { labelElementOf } from '@/labels/label-element';
import { readField } from '@/labels/label-resolve';
import { useViewerStore } from '@/store';
import { useProjectStore } from './project-store';
import { effectiveFields, MODEL_ENTITIES, readStoreFacts, resolvedTitleBlock as engineResolvedTitleBlock, projectNameFromFile, SILENT_FACTS, type ModelEntity, type TitleBlockFacts as ModelFacts, type ResolvedField, type TitleSources } from '@bimvoice/ifcsheet';

/** The first loaded model that has a project. */
function projectStore(): { modelId: string; store: IfcDataStore } | null {
  for (const [modelId, model] of useViewerStore.getState().models) {
    const store = model.ifcDataStore;
    if (store?.source?.length && store.entityIndex?.byType.get('IFCPROJECT')?.length) return { modelId, store };
  }
  return null;
}

const LABEL_ATTRIBUTES = new Set(['Name', 'LongName', 'Description']);

/**
 * The facts of one model at one edit, shared by every caller: the issue run asks once per sheet and every mounted
 * title block asks again, and each fresh read would build an `EntityExtractor` and re-parse the same records.
 * A new model (another store) or an edit (`mutationVersion`) reads again.
 */
let shared: { store: IfcDataStore; modelId: string; version: number; facts: ModelFacts } | null = null;

/** True when a model is loaded and none carries an IFC project (glTF, LandXML, point clouds, IFCX without IfcProject): the title block has nothing to read. */
export function lacksProjectData(): boolean {
  return useViewerStore.getState().models.size > 0 && projectStore() === null;
}

/** A model with no IFC project reads silent, except for its file name. */
function fileFacts(): ModelFacts {
  const first = [...useViewerStore.getState().models.values()].find((m) => !m.linked) ?? [...useViewerStore.getState().models.values()][0];
  const name = first ? projectNameFromFile(first.name) : '';
  return name ? { ...SILENT_FACTS, file: () => name } : SILENT_FACTS;
}

/** The loaded model as `ModelFacts`, read once per model and edit; silent without one (a model without an IFC project offers its file name). */
export function modelFacts(): ModelFacts {
  const found = projectStore();
  if (!found) return fileFacts();
  const version = useViewerStore.getState().mutationVersion;
  if (shared && shared.store === found.store && shared.modelId === found.modelId && shared.version === version) return shared.facts;
  const facts = readModelFacts(found.modelId, found.store);
  shared = { store: found.store, modelId: found.modelId, version, facts };
  return facts;
}

/**
 * The model is read by the engine's reader (`packages/ifcsheet/src/title-block-records.ts`), the one the PDF uses; the app
 * only has the names, descriptions and properties read through the label reader, so an edit in the Properties panel shows.
 */
function readModelFacts(modelId: string, store: IfcDataStore): ModelFacts {
  const idOf = (on: ModelEntity): number | null => store.entityIndex.byType.get(on.toUpperCase())?.[0] ?? null;
  return readStoreFacts(store, {
    attribute: (_on, name, id) => (LABEL_ATTRIBUTES.has(name) ? labelElementOf(modelId, id)?.attribute(name as 'Name') ?? '' : undefined),
    property: (on, pset, property) => {
      for (const entity of on ? [on] : MODEL_ENTITIES) {
        const id = idOf(entity);
        const el = id === null ? null : labelElementOf(modelId, id);
        const value = el ? readField({ kind: 'property', set: pset, name: property, from: 'any' }, el) : undefined;
        if (value !== undefined && value !== null && value !== '') return String(value);
      }
      return '';
    },
  });
}

/** The fields the title block resolves, from the model and the project's typed values and mapping. */
export function resolvedTitleBlock(typed: Record<string, string> | undefined, custom: TitleSources | undefined, facts: ModelFacts = modelFacts()): Record<string, ResolvedField> {
  return engineResolvedTitleBlock(typed, custom, facts);
}

/** What every sheet prints for the project (before a sheet's own fields): typed over mapped. */
export function effectiveTitleBlock(typed?: Record<string, string>, custom?: TitleSources): Record<string, string> {
  const s = useProjectStore.getState();
  const t = typed ?? s.titleBlock;
  return effectiveFields(resolvedTitleBlock(t, custom ?? s.titleBlockSources), t);
}

/** The same, re-read when the typed values, the mapping, the models or an edit change. */
export function useResolvedTitleBlock(): Record<string, ResolvedField> {
  const typed = useProjectStore((s) => s.titleBlock);
  const custom = useProjectStore((s) => s.titleBlockSources);
  const models = useViewerStore((s) => s.models);
  const edits = useViewerStore((s) => s.mutationVersion);
  return useMemo(() => resolvedTitleBlock(typed, custom), [typed, custom, models, edits]);
}

export function useEffectiveTitleBlock(): Record<string, string> {
  const typed = useProjectStore((s) => s.titleBlock);
  const resolved = useResolvedTitleBlock();
  return useMemo(() => effectiveFields(resolved, typed), [resolved, typed]);
}
