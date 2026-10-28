/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities (antemasuratoare, #75): the office's own mapping from what the model holds to the articles of
 * an estimate. An article says WHICH elements it counts (a type, a material, an IFC class, with the schedule filter of
 * `schedule-filter.ts` narrowing it: predefined type, property tests, storeys), WHICH declared quantity it takes, with a
 * factor and an optional waste percentage, and the unit it is priced in. The table starts empty and ships no norm or
 * article code: the office types its own (`defineArticle`).
 *
 * This file is the data: the article, its units and quantities, its validation and its reader (a saved project and a
 * `.bvlib` library both read articles with {@link readBoqArticles}). The sum is `boq-compute.ts`, the table `boq-table.ts`.
 *
 * Quantities are the model's DECLARED Qto values only. A quantity the model does not state for an element is never read
 * as zero: the element is reported as missing it.
 */

import { readSubReportFilter, type SubReportFilter } from './schedule-filter.js';

/** The units an article is priced in: metre, square metre, cubic metre, pieces, kilogram. */
export const BOQ_UNITS = ['m', 'm2', 'm3', 'buc', 'kg'] as const;
export type BoqUnit = (typeof BOQ_UNITS)[number];

/** A unit as written on paper (`m²`, `m³`). */
export const BOQ_UNIT_TEXT: Readonly<Record<BoqUnit, string>> = { m: 'm', m2: 'm²', m3: 'm³', buc: 'buc', kg: 'kg' };

/** What a quantity measures. */
export type BoqDimension = 'length' | 'area' | 'volume' | 'count' | 'mass';

const UNIT_DIMENSION: Readonly<Record<BoqUnit, BoqDimension>> = { m: 'length', m2: 'area', m3: 'volume', buc: 'count', kg: 'mass' };

/** The dimension a unit measures. */
export const unitDimension = (unit: BoqUnit): BoqDimension => UNIT_DIMENSION[unit];

/**
 * The one quantity that is not read from a Qto set: the number of elements, for articles priced per piece. Every counted
 * element has it, so it is never missing.
 */
export const COUNT_QUANTITY = 'Count';

/** The standard quantity names the editor offers, by dimension. Others are accepted when their name says what they measure (`quantityDimension`). */
export const BOQ_QUANTITIES: Readonly<Record<BoqDimension, readonly string[]>> = {
  length: ['Length', 'Width', 'Height', 'Depth', 'Perimeter'],
  area: ['NetSideArea', 'GrossSideArea', 'NetArea', 'GrossArea', 'NetFloorArea', 'GrossFloorArea', 'NetFootprintArea', 'GrossFootprintArea', 'NetSurfaceArea', 'GrossSurfaceArea', 'OuterSurfaceArea', 'CrossSectionArea'],
  volume: ['NetVolume', 'GrossVolume'],
  count: [COUNT_QUANTITY],
  mass: ['NetWeight', 'GrossWeight'],
};

/**
 * What a quantity name measures, from the name the Qto sets give it (`NetVolume`, `GrossSideArea`, `Length`, `NetWeight`); null for a
 * name that says nothing about it. A name is never guessed at: `Width` is a length, `Angle` is not a quantity an article can take.
 */
export function quantityDimension(name: string): BoqDimension | null {
  if (name === COUNT_QUANTITY) return 'count';
  if (/Volume$/.test(name)) return 'volume';
  if (/Area$/.test(name)) return 'area';
  if (/Weight$/.test(name)) return 'mass';
  if (/(Length|Width|Height|Depth|Perimeter|Thickness|Diameter)$/.test(name)) return 'length';
  return null;
}

/** One article of the table. */
export interface BoqArticle {
  id: string;
  /** The office's own article code. Empty while it is being typed: an article without one is not computed. */
  code: string;
  description: string;
  unit: BoqUnit;
  /** Only elements whose defining type has this Name (without regard to case or spacing). */
  typeName?: string;
  /** Only elements with a material, or a layer or constituent, of this name. The element's whole quantity counts (see `BoqLine.sharedMaterial`). */
  material?: string;
  /** The schedule filter (#287): IFC classes, predefined types, property tests and storeys that narrow it. `classes` is one way to choose elements. */
  filter?: SubReportFilter;
  /** Which declared quantity: `NetVolume`, `NetSideArea`, `Length`, ... or `Count` (the elements themselves). */
  quantity: string;
  /** Multiplied with the quantity (1.5 for a wall counted on two faces, 0.001 ...). Above zero. */
  factor: number;
  /** Waste, percent added on top (5 = ×1.05). Absent: none. */
  waste?: number;
}

/** Why an article is refused. `params` fill the message of that kind (`describeBoqProblem`, the catalogue's `boq.problem.<kind>`). */
export type BoqProblemKind = 'noCode' | 'noSelector' | 'unknownQuantity' | 'unitMismatch' | 'badFactor' | 'badWaste';
export interface BoqProblem { kind: BoqProblemKind; params: Record<string, string | number> }

/** The largest waste percentage accepted: more than that is a typing error, not a waste. */
export const MAX_WASTE = 100;

/** Whether the article picks any element at all: a type, a material or an IFC class. Property tests and storeys only narrow that. */
export const hasSelector = (a: Pick<BoqArticle, 'typeName' | 'material' | 'filter'>): boolean =>
  !!(a.typeName?.trim() || a.material?.trim() || a.filter?.classes?.length);

/**
 * What is wrong with an article, or null. The quantity's dimension must be the unit's: `NetVolume` prices in m³, not m²;
 * a mismatch is refused, never converted. The first problem found is the one returned.
 */
export function boqProblem(a: BoqArticle): BoqProblem | null {
  if (!a.code.trim()) return { kind: 'noCode', params: {} };
  if (!hasSelector(a)) return { kind: 'noSelector', params: { code: a.code } };
  const dimension = quantityDimension(a.quantity);
  if (!dimension) return { kind: 'unknownQuantity', params: { code: a.code, quantity: a.quantity } };
  if (dimension !== unitDimension(a.unit)) {
    const fits = BOQ_UNITS.find((u) => unitDimension(u) === dimension);
    return { kind: 'unitMismatch', params: { code: a.code, quantity: a.quantity, unit: BOQ_UNIT_TEXT[a.unit], measures: dimension, fits: fits ? BOQ_UNIT_TEXT[fits] : '' } };
  }
  if (!Number.isFinite(a.factor) || a.factor <= 0) return { kind: 'badFactor', params: { code: a.code, factor: a.factor } };
  if (a.waste !== undefined && (!Number.isFinite(a.waste) || a.waste < 0 || a.waste > MAX_WASTE)) return { kind: 'badWaste', params: { code: a.code, waste: a.waste } };
  return null;
}

/** A new article with nothing chosen but a unit and its usual quantity: the row the editor adds. */
export function newArticle(id: string, unit: BoqUnit = 'm3'): BoqArticle {
  const quantity = unit === 'buc' ? COUNT_QUANTITY : (BOQ_QUANTITIES[unitDimension(unit)][0] ?? COUNT_QUANTITY);
  return { id, code: '', description: '', unit, quantity, factor: 1 };
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** An article as saved, read back: null without an id; a field of the wrong type is dropped or takes its default, so a damaged file loads what it can. */
export function readBoqArticle(raw: unknown): BoqArticle | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  const unit = BOQ_UNITS.find((u) => u === o.unit) ?? 'm3';
  const out: BoqArticle = {
    id: o.id, code: text(o.code), description: text(o.description), unit,
    quantity: typeof o.quantity === 'string' && o.quantity ? o.quantity : newArticle(o.id, unit).quantity,
    factor: typeof o.factor === 'number' && Number.isFinite(o.factor) ? o.factor : 1,
  };
  if (text(o.typeName).trim()) out.typeName = text(o.typeName);
  if (text(o.material).trim()) out.material = text(o.material);
  const filter = readSubReportFilter(o.filter);
  // Only the dimensions an article reads: its storeys, classes, predefined types and property tests (not the schedule's door / window kinds or its picked types).
  const kept: SubReportFilter = {};
  if (filter.levels) kept.levels = filter.levels;
  if (filter.classes) kept.classes = filter.classes;
  if (filter.predefined) kept.predefined = filter.predefined;
  if (filter.properties) kept.properties = filter.properties;
  if (Object.keys(kept).length > 0) out.filter = kept;
  if (typeof o.waste === 'number' && Number.isFinite(o.waste) && o.waste !== 0) out.waste = o.waste;
  return out;
}

/** The articles of a saved project or library, read back; anything that is not a list is no articles. */
export const readBoqArticles = (raw: unknown): BoqArticle[] => (Array.isArray(raw) ? raw.flatMap((a) => readBoqArticle(a) ?? []) : []);

/** The property names the articles' filters read (lower case), so the reader takes only those from the model. */
export function boqPropertyNames(articles: readonly BoqArticle[]): string[] {
  const names = new Set<string>();
  for (const a of articles) for (const t of a.filter?.properties ?? []) names.add(t.name.trim().toLowerCase());
  return [...names].sort();
}
