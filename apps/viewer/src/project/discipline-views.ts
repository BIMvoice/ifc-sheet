/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Discipline plans, the starters under "Add a drawing": a structural plan, a
 * foundation plan and a roof plan. Each is an ordinary plan view made with
 * its settings preset: a level, a cut height and view depth, graphics (the
 * view's own `graphics`: a preset and per-category pens) and `discipline`,
 * the element filter that decides WHICH elements the plan draws. The filter
 * is the one thing a category switch cannot say (a wall is structural when
 * its LoadBearing property says so, a wall is a foundation wall when it
 * stands on the lowest storey below ±0.00), so it is a predicate over
 * `ElementFacts`. Pure; `discipline-facts.ts` reads the facts off the model.
 *
 * Selection rules, by IFC class:
 *
 * - Structural: IfcColumn, IfcBeam, IfcMember (not a mullion), IfcSlab,
 *   IfcFooting and IfcPile are drawn unless `Pset_*Common.LoadBearing` is
 *   FALSE on them; no property means drawn. IfcWall and IfcWallStandardCase
 *   are drawn only when LoadBearing is TRUE; no property means not drawn.
 *   Only the plan's own storey: an element of another storey is left out
 *   (what a floor shows of the roof above is the roof plan's).
 * - Foundation: IfcFooting and IfcPile always; an IfcSlab that is a
 *   BASESLAB, or stands on the foundation storey; a wall standing on the
 *   foundation storey unless its LoadBearing is FALSE. The foundation storey
 *   is the lowest storey, and only when it lies below ±0.00 (a model with no
 *   basement has no foundation walls, its footings and ground slab still draw).
 * - Roof: IfcRoof, whatever is aggregated into one, IfcSlab of type ROOF, and
 *   the roof's penetrations: an IfcWindow of type SKYLIGHT or LIGHTDOME, or
 *   one that fills an opening in a roof or a ROOF slab.
 */

import { getInheritanceChainAcrossSchemas } from '@ifc-lite/parser';
import type { CategoryGraphics, NewProjectView, ProjectLevel, ProjectView } from './types';
import { DEFAULT_PLAN_CUT_HEIGHT_M, freshProjectId, uniqueViewName } from './view-defaults';

import type { DisciplineId } from '@bimvoice/ifcsheet';

export type { DisciplineId } from '@bimvoice/ifcsheet';

// The ids and their check are the engine's, which reads a plan's discipline from a project file (`set-read.ts`).
export { DISCIPLINE_IDS, isDisciplineId } from '@bimvoice/ifcsheet';

/** What the filter needs to know of one element; the host's, for a part of a wall or slab. */
export interface ElementFacts {
  /** Upper-case IFC class, `IFCWALL`. */
  className: string;
  /** Upper-case PredefinedType, '' without one. */
  predefinedType: string;
  /** `LoadBearing` of its common property set: true, false, or null when it has none. */
  loadBearing: boolean | null;
  /** Elevation of its storey, metres; null when it is on none. */
  storeyElevation: number | null;
  /** Upper-case class of what it is aggregated into (a roof's slab), '' for none. */
  aggregateClass: string;
  /** Upper-case class and PredefinedType of the element whose opening it fills (a window in a roof), '' for none. */
  hostClass: string;
  hostPredefinedType: string;
}

/** The model as the filter sees it. */
export interface DisciplineModel {
  /** Elevation of the lowest storey, metres; null for a model without storeys. */
  lowestStorey: number | null;
  /** Elevation of the storey the plan is of, metres. */
  planStorey: number | null;
}

/** A storey this far below ±0.00 or more is below ground (metres). */
export const GROUND_TOLERANCE_M = 0.05;

/**
 * The class and its supertypes, upper-case (`IFCCOLUMNSTANDARDCASE`, `IFCCOLUMN`, …, from the schema), so the
 * IFC4 subtypes (`*StandardCase`, `*ElementedCase`) count as their base class; just the class when the schema
 * does not know it.
 */
const lineages = new Map<string, readonly string[]>();
function lineage(className: string): readonly string[] {
  let chain = lineages.get(className);
  if (!chain) {
    const known = className ? getInheritanceChainAcrossSchemas(className).map((c) => c.toUpperCase()) : [];
    lineages.set(className, (chain = known.length ? known : [className]));
  }
  return chain;
}

/** Whether the upper-case class is `base` or one of its subtypes. */
const isA = (className: string, base: string): boolean => lineage(className).includes(base);

const FRAMING = ['IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER', 'IFCSLAB', 'IFCFOOTING', 'IFCPILE', 'IFCPLATE'];

/** The framing class the element is (or descends from), '' for none. */
const framingBase = (className: string): string => lineage(className).find((c) => FRAMING.includes(c)) ?? '';

const isWall = (f: ElementFacts) => isA(f.className, 'IFCWALL');
const isFooting = (className: string) => isA(className, 'IFCFOOTING') || isA(className, 'IFCPILE');
const isRoofSlab = (className: string, predefined: string) => isA(className, 'IFCSLAB') && predefined === 'ROOF';
const isRoofHost = (className: string, predefined: string) => isA(className, 'IFCROOF') || isRoofSlab(className, predefined);

/** Whether `facts` stands on the foundation storey: the lowest, and below ground. */
function onFoundationStorey(facts: ElementFacts, model: DisciplineModel): boolean {
  const { lowestStorey } = model;
  if (lowestStorey === null || lowestStorey > -GROUND_TOLERANCE_M || facts.storeyElevation === null) return false;
  return sameStorey(facts.storeyElevation, lowestStorey);
}

const sameStorey = (a: number, b: number) => Math.abs(a - b) < GROUND_TOLERANCE_M;

function structural(f: ElementFacts, model: DisciplineModel): boolean {
  if (f.storeyElevation !== null && model.planStorey !== null && !sameStorey(f.storeyElevation, model.planStorey)) return false;
  if (isWall(f)) return f.loadBearing === true;
  const base = framingBase(f.className);
  if (!base) return false;
  if (base === 'IFCMEMBER' && f.predefinedType === 'MULLION') return false;
  if (base === 'IFCPLATE' && f.predefinedType === 'CURTAIN_PANEL') return false;
  return f.loadBearing !== false;
}

function foundation(f: ElementFacts, model: DisciplineModel): boolean {
  if (isFooting(f.className)) return true;
  if (isA(f.className, 'IFCSLAB')) return f.predefinedType === 'BASESLAB' || onFoundationStorey(f, model);
  if (isWall(f)) return f.loadBearing !== false && onFoundationStorey(f, model);
  return false;
}

function roof(f: ElementFacts): boolean {
  if (isRoofHost(f.className, f.predefinedType) || isA(f.aggregateClass, 'IFCROOF')) return true;
  if (!isA(f.className, 'IFCWINDOW')) return false;
  return f.predefinedType === 'SKYLIGHT' || f.predefinedType === 'LIGHTDOME' || isRoofHost(f.hostClass, f.hostPredefinedType);
}

/** Whether a plan of `discipline` draws the element. */
export function disciplineKeeps(discipline: DisciplineId, facts: ElementFacts, model: DisciplineModel): boolean {
  switch (discipline) {
    case 'structural': return structural(facts, model);
    case 'foundation': return foundation(facts, model);
    case 'roof': return roof(facts);
  }
}

type Categories = Record<string, CategoryGraphics>;

const hidden = (...ids: string[]): Categories => Object.fromEntries(ids.map((id) => [id, { visible: false }]));

interface DisciplinePreset {
  name: string;
  /** Cut height above the plan's level and view depth below the cut, metres. */
  cutHeight: number;
  viewDepth: number;
  /** The graphics preset and per-category pens. */
  presetId: string;
  categories: Categories;
}

/**
 * The roof plan's cut: above any roof, so nothing is cut and the plan looks
 * down on it. The depth reaches back down through the whole model.
 */
export const ROOF_CUT_HEIGHT_M = 100;

export const DISCIPLINES: Record<DisciplineId, DisciplinePreset> = {
  structural: {
    name: 'Structural Plan',
    cutHeight: DEFAULT_PLAN_CUT_HEIGHT_M,
    viewDepth: DEFAULT_PLAN_CUT_HEIGHT_M,
    presetId: 'preset-structural',
    categories: {
      walls: { lineWeight: 'heavy' }, columns: { lineWeight: 'heavy' }, beams: { lineWeight: 'heavy' },
      slabs: { lineWeight: 'medium' }, other: { lineWeight: 'heavy' },
      ...hidden('doors', 'windows', 'stairs', 'railings', 'spaces', 'furniture', 'roofs'),
    },
  },
  foundation: {
    name: 'Foundation Plan',
    cutHeight: 1,
    viewDepth: 6,
    presetId: 'preset-monochrome',
    categories: {
      walls: { lineWeight: 'heavy' }, slabs: { lineWeight: 'medium' }, other: { lineWeight: 'heavy' },
      ...hidden('doors', 'windows', 'columns', 'beams', 'stairs', 'railings', 'spaces', 'furniture', 'roofs'),
    },
  },
  roof: {
    name: 'Roof Plan',
    cutHeight: ROOF_CUT_HEIGHT_M,
    viewDepth: ROOF_CUT_HEIGHT_M,
    presetId: 'preset-monochrome',
    categories: {
      roofs: { lineWeight: 'heavy' }, slabs: { lineWeight: 'heavy' }, windows: { lineWeight: 'medium' },
      ...hidden('walls', 'doors', 'columns', 'beams', 'stairs', 'railings', 'spaces', 'furniture', 'other'),
    },
  },
};

/** The level a discipline plan sits on when it is not picked: the foundation plan on the lowest, the roof plan on the highest. */
export function defaultDisciplineLevel(discipline: DisciplineId, levels: readonly ProjectLevel[]): ProjectLevel | undefined {
  if (discipline === 'structural') return undefined;
  return [...levels].sort((a, b) => a.elevation - b.elevation)[discipline === 'foundation' ? 0 : levels.length - 1];
}

/** The plan view of `discipline` on `level`, set up as its starter. */
export function disciplineViewFor(discipline: DisciplineId, level: ProjectLevel, views: readonly ProjectView[]): NewProjectView {
  const preset = DISCIPLINES[discipline];
  return {
    id: freshProjectId('view'),
    kind: 'plan',
    name: uniqueViewName(`${preset.name} - ${level.name}`, views),
    level: { ...level, storeyGlobalIds: [...level.storeyGlobalIds] },
    cutHeight: preset.cutHeight,
    viewDepth: preset.viewDepth,
    discipline,
    graphics: { presetId: preset.presetId, categories: structuredClone(preset.categories) },
    auto: false,
  };
}
