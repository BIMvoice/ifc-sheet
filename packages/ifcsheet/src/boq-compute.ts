/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The antemasuratoare sum (#75): the elements of the models in, each article's total out. The ONE function, for the app, the
 * command line and the checks, so they cannot disagree.
 *
 * An article counts the elements it picks (type, material, IFC class, narrowed by the schedule filter of `schedule-filter.ts`),
 * each by the declared quantity it names, times its factor, plus its waste. An element that does not state that quantity is
 * NOT counted as zero: it is left out of the sum and reported (`BoqLine.missing`), so a total never hides a gap.
 */

import { emptyTally, tallyTotal, tallyValue, type SumTally } from '@ifc-lite/lists';
import { COUNT_QUANTITY, boqProblem, quantityDimension, type BoqArticle, type BoqDimension, type BoqProblem } from './boq.js';
import { passesElementFilter, type PropertyFact } from './schedule-filter.js';

/** A quantity an element declares, in SI (metres, square metres, cubic metres, kilograms). */
export interface BoqQuantity { name: string; dimension: BoqDimension; value: number }

/** An element as the sum reads it. Read from the models by `readBoqElements` (`boq-read.ts`). */
export interface BoqElement {
  modelId: string;
  expressId: number;
  globalId: string;
  name: string;
  /** The declared IFC class (`IfcWallStandardCase`). */
  ifcClass: string;
  /** The PredefinedType without dots; null when it has none. */
  predefinedType: string | null;
  /** The defining type's class (`IfcWallType`) and Name; null when the element has no type. */
  typeClass: string | null;
  typeName: string | null;
  /** The storey's name; '' on none. */
  level: string;
  /** The names of its materials, layers and constituents. */
  materials: string[];
  /** The properties the articles' filters name. */
  properties: PropertyFact[];
  quantities: BoqQuantity[];
}

/** An element the report names. */
export interface BoqElementRef { modelId: string; expressId: number; globalId: string; name: string; ifcClass: string }

/** What one type (or, for elements without one, one class) adds to an article. */
export interface BoqTypeLine {
  /** The type's name; null for the elements that have none. */
  typeName: string | null;
  /** The type's class when typed, else the elements' class. */
  className: string;
  /** Elements picked, those that stated the quantity, and those that did not. */
  matched: number;
  counted: number;
  missing: number;
  /** The type's part of the article's total, factor and waste applied; null when none of its elements stated the quantity. */
  total: number | null;
}

/** One article's result. */
export interface BoqLine {
  article: BoqArticle;
  /** Why it was not computed; null when it was. */
  problem: BoqProblem | null;
  /** The sum in the article's unit; null when it was refused or when no picked element states the quantity (nothing measured is not zero). */
  total: number | null;
  /** Elements picked, those that stated the quantity (summed), and those that did not (left out, listed in `missing`). */
  matched: number;
  counted: number;
  missing: BoqElementRef[];
  /** Picked by material although they have other materials too: their whole quantity is in the total. */
  sharedMaterial: number;
  byType: BoqTypeLine[];
}

export interface BoqResult { lines: BoqLine[] }

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** `IfcWallStandardCase` is an `IfcWall` for a filter that names the class. */
const parentClass = (c: string): string => c.replace(/(StandardCase|ElementedCase)$/, '');

/** Whether the article picks the element: its type, its material and its filter must all agree (an absent one does not restrict). */
export function picks(a: BoqArticle, e: BoqElement): boolean {
  if (a.typeName?.trim() && norm(a.typeName) !== norm(e.typeName ?? '')) return false;
  if (a.material?.trim() && !e.materials.some((m) => norm(m) === norm(a.material!))) return false;
  if (!a.filter) return true;
  // The filter is the schedule's (#287), its class test exact; a StandardCase element answers to its parent's name too.
  const facts = { level: e.level, predefinedType: e.predefinedType, properties: e.properties };
  return passesElementFilter(a.filter, { ...facts, ifcClass: e.ifcClass }) || passesElementFilter(a.filter, { ...facts, ifcClass: parentClass(e.ifcClass) });
}

/** The declared value of the article's quantity on the element; null when the element does not state it. `Count` is the element itself. */
export function declared(a: BoqArticle, e: BoqElement): number | null {
  if (a.quantity === COUNT_QUANTITY) return 1;
  const dimension = quantityDimension(a.quantity);
  const q = e.quantities.find((x) => x.dimension === dimension && norm(x.name) === norm(a.quantity));
  return q && Number.isFinite(q.value) ? q.value : null;
}

const ref = (e: BoqElement): BoqElementRef => ({ modelId: e.modelId, expressId: e.expressId, globalId: e.globalId, name: e.name, ifcClass: e.ifcClass });

/** The sum of one article over the elements. */
function lineOf(article: BoqArticle, elements: readonly BoqElement[]): BoqLine {
  const problem = boqProblem(article);
  const line: BoqLine = { article, problem, total: null, matched: 0, counted: 0, missing: [], sharedMaterial: 0, byType: [] };
  if (problem) return line;
  // The factor and the waste apply to the sum, once: a type's part and the total are the same rule.
  const scale = article.factor * (1 + (article.waste ?? 0) / 100);
  const types = new Map<string, BoqTypeLine>();
  const total = emptyTally();
  const typeTallies = new Map<string, SumTally>();
  for (const e of elements) {
    if (!picks(article, e)) continue;
    const typed = e.typeName !== null && e.typeClass !== null;
    const key = typed ? `T|${e.typeClass}|${e.typeName}` : `C|${e.ifcClass}`;
    let t = types.get(key);
    if (!t) types.set(key, (t = { typeName: typed ? e.typeName : null, className: typed ? e.typeClass! : e.ifcClass, matched: 0, counted: 0, missing: 0, total: null }));
    if (!typeTallies.has(key)) typeTallies.set(key, emptyTally());
    line.matched++;
    t.matched++;
    if (article.material?.trim() && e.materials.some((m) => norm(m) !== norm(article.material!))) line.sharedMaterial++;
    const value = declared(article, e);
    if (value === null) {
      line.missing.push(ref(e));
      t.missing++;
      continue;
    }
    line.counted++;
    t.counted++;
    tallyValue(total, value);
    tallyValue(typeTallies.get(key)!, value);
  }
  // The one "quantity or missing" rule the Lists engine sums by (#411): nothing stated is a dash, never 0.
  const scaled = (t: SumTally) => { const v = tallyTotal(t); return v === null ? null : v * scale; };
  line.total = scaled(total);
  line.byType = [...types.entries()]
    .map(([key, t]) => ({ ...t, total: scaled(typeTallies.get(key)!) }))
    .sort((a, b) => Number(a.typeName === null) - Number(b.typeName === null) || a.className.localeCompare(b.className) || (a.typeName ?? '').localeCompare(b.typeName ?? ''));
  return line;
}

/** Every article over the elements, in the table's order. */
export function computeBoq(elements: readonly BoqElement[], articles: readonly BoqArticle[]): BoqResult {
  return { lines: articles.map((a) => lineOf(a, elements)) };
}

/** What the sum could not state: the articles that are missing a quantity and the elements behind them. */
export interface BoqMissing {
  /** Distinct elements, however many articles they are missing a quantity for. */
  elements: number;
  articles: number;
  /** `CODE (n)` for each article, in the table's order. */
  list: string;
}

export function boqMissing(result: BoqResult): BoqMissing {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const l of result.lines) {
    if (l.missing.length === 0) continue;
    for (const m of l.missing) seen.add(`${m.modelId}:${m.expressId}`);
    parts.push(`${l.article.code} (${l.missing.length})`);
  }
  return { elements: seen.size, articles: parts.length, list: parts.join(', ') };
}
