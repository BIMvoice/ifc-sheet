/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The facts a discipline plan's filter reads (`discipline-views.ts`), taken
 * off the model through the labels' element reader (`labels/label-element.ts`:
 * the lists' data provider, so an edited LoadBearing reads as it will
 * export), and the view's omit predicate that `styledDrawing` takes. A part
 * of a wall or slab (IfcBuildingElementPart) is its host's facts.
 */

import { RelationshipType } from '@ifc-lite/data';
import { labelElementOf } from '@/labels/label-element';
import type { LabelElement } from '@/labels/label-resolve';
import { useViewerStore } from '@/store';
import { useProjectStore } from './project-store';
import { storeyOfElement } from './effective-storey';
import { modelLevels } from './model-levels';
import { disciplineKeeps, type DisciplineModel, type ElementFacts } from './discipline-views';
import type { ProjectView } from './types';
import { resolvePlanLevel } from './view-defaults';
import { drawnBySymbol } from './view-symbols';

const COMMON_SET = /^Pset_\w+Common$/i;

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toUpperCase();
    if (v === 'TRUE' || v === '.T.' || v === 'T') return true;
    if (v === 'FALSE' || v === '.F.' || v === 'F') return false;
  }
  return null;
}

/**
 * `LoadBearing` of the element's common property set (`Pset_WallCommon`,
 * `Pset_SlabCommon`…), else of its type's; null when neither has it.
 */
export function loadBearingOf(el: Pick<LabelElement, 'propertySets' | 'typePropertySets'>): boolean | null {
  for (const sets of [el.propertySets(), el.typePropertySets()]) {
    for (const set of sets) {
      if (!COMMON_SET.test(set.name)) continue;
      const found = set.properties.find((p) => p.name.toLowerCase() === 'loadbearing');
      const value = found ? asBoolean(found.value) : null;
      if (value !== null) return value;
    }
  }
  return null;
}

/** The facts of the element `el` reads; the relations come in from the model. */
export function factsOf(
  el: Pick<LabelElement, 'className' | 'attribute' | 'propertySets' | 'typePropertySets'>,
  storeyElevation: number | null,
  aggregateClass: string,
  host: { className: string; predefinedType: string } | null,
): ElementFacts {
  return {
    className: el.className().toUpperCase(),
    predefinedType: el.attribute('PredefinedType').toUpperCase(),
    loadBearing: loadBearingOf(el),
    storeyElevation,
    aggregateClass: aggregateClass.toUpperCase(),
    hostClass: host?.className.toUpperCase() ?? '',
    hostPredefinedType: host?.predefinedType.toUpperCase() ?? '',
  };
}

type Resolved = { modelId: string; expressId: number };

function relatedOf(modelId: string, expressId: number, type: RelationshipType): number | undefined {
  return useViewerStore.getState().models.get(modelId)?.ifcDataStore?.relationships.getRelated(expressId, type, 'inverse')[0];
}

function classAndType(at: Resolved): { className: string; predefinedType: string } | null {
  const el = labelElementOf(at.modelId, at.expressId);
  return el ? { className: el.className(), predefinedType: el.attribute('PredefinedType') } : null;
}

/** Elevations of a model's storeys by express id, metres. */
function storeyElevations(modelId: string): Map<number, number> {
  return new Map(modelLevels(modelId).map((l) => [l.expressId, l.elevation]));
}

/** The lowest storey of the project, metres; null without storeys. */
function lowestStorey(): number | null {
  const levels = useProjectStore.getState().levels;
  return levels.length ? Math.min(...levels.map((l) => l.elevation)) : null;
}

/**
 * A reader of the facts of drawn elements by renderer id, remembering what it
 * read: one pass over a drawing asks about the same element for every one of
 * its lines. Null for an id that is no element of a loaded model.
 */
export function factsReader(): (renderId: number) => ElementFacts | null {
  const known = new Map<number, ElementFacts | null>();
  const elevations = new Map<string, Map<number, number>>();
  return (renderId) => {
    if (known.has(renderId)) return known.get(renderId) ?? null;
    const facts = readFacts(renderId, elevations);
    known.set(renderId, facts);
    return facts;
  };
}

function readFacts(renderId: number, elevations: Map<string, Map<number, number>>): ElementFacts | null {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(renderId);
  if (!ref) return null;
  let at: Resolved = ref;
  let aggregate: Resolved | null = null;
  const parentId = relatedOf(at.modelId, at.expressId, RelationshipType.Aggregates);
  if (parentId !== undefined) aggregate = { modelId: at.modelId, expressId: parentId };
  let el = labelElementOf(at.modelId, at.expressId);
  // A layer part is its host: the host's class, property sets and storey.
  if (el?.className().toUpperCase() === 'IFCBUILDINGELEMENTPART' && aggregate) {
    at = aggregate;
    aggregate = null;
    el = labelElementOf(at.modelId, at.expressId);
  }
  if (!el) return null;
  let storeyElevation: number | null = null;
  const storeyId = storeyOfElement(at.modelId, at.expressId);
  if (storeyId !== null) {
    if (!elevations.has(at.modelId)) elevations.set(at.modelId, storeyElevations(at.modelId));
    storeyElevation = elevations.get(at.modelId)?.get(storeyId) ?? null;
  }
  // The element an opening cuts, for what fills one (a window in a roof).
  const openingId = relatedOf(at.modelId, at.expressId, RelationshipType.FillsElement);
  const hostId = openingId === undefined ? undefined : relatedOf(at.modelId, openingId, RelationshipType.VoidsElement);
  const host = hostId === undefined ? null : classAndType({ modelId: at.modelId, expressId: hostId });
  const aggregateEl = aggregate ? labelElementOf(aggregate.modelId, aggregate.expressId) : null;
  return factsOf(el, storeyElevation, aggregateEl?.className() ?? '', host);
}

/**
 * What a view leaves out of its drawing beyond its hidden categories, for
 * `styledDrawing`: a plan draws its doors and windows from their symbols, not
 * their cut (except a roof plan, whose skylights have no symbol), and a
 * discipline plan draws only the elements its discipline keeps. Undefined
 * when the view leaves nothing out.
 */
export function viewOmits(view: ProjectView | undefined): ((entityId: number, ifcType: string | undefined) => boolean) | undefined {
  if (view?.kind !== 'plan') return undefined;
  const discipline = view.discipline;
  if (!discipline) return drawnBySymbol;
  const read = factsReader();
  const planStorey = (resolvePlanLevel(view, useProjectStore.getState().levels) ?? view.level).elevation;
  const model: DisciplineModel = { lowestStorey: lowestStorey(), planStorey };
  return (entityId, ifcType) => {
    if (discipline !== 'roof' && drawnBySymbol(entityId, ifcType)) return true;
    const facts = read(entityId);
    return facts !== null && !disciplineKeeps(discipline, facts, model);
  };
}
