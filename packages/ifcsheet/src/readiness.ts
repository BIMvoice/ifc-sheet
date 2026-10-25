/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the IFC itself lacks, as data (#105, moved here by #164): the model-side
 * counterpart of the set-side checks in the app's `check/findings.ts`. Each
 * finding says what is missing and which IfcSheet feature is weaker for it, so
 * a thin draft set is explained, not puzzling. A pure function of counts
 * (`ModelFacts`); `readiness-read.ts` counts them from parsed models.
 *
 * Also its own entry, `@bimvoice/ifcsheet/readiness`: it imports nothing, so the
 * app's translation catalogue can spread the English text without loading the
 * parser. The web app translates by the catalogue keys; the command line and the
 * MCP tool say it in English with {@link describeReadiness}.
 */

import type { BoqMissing } from './boq-compute.js';
import { subReportParams, type SubReportCheck } from './sub-report-check.js';

/** What the loaded models hold, counted once. "Elements" are the products that have geometry, rooms (IfcSpace) apart. */
export interface ModelFacts {
  storeys: number;
  spaces: number;
  elements: number;
  elementsWithoutStorey: number;
  elementsWithoutMaterial: number;
  elementsWithoutQuantities: number;
  /** GlobalIds carried by more than one entity, and the entities that share them. */
  duplicateGlobalIds: number;
  duplicatedEntities: number;
  /** The small elements the views are framed without because they lie far from the building (`framing.ts`), farthest first; absent: none were looked for. */
  farElements?: readonly FarElementFact[];
}

/** A far-away element as a message names it: its label (Name, else class and GlobalId) and its distance from the building, metres. */
export interface FarElementFact {
  label: string;
  distance: number;
}

export type ReadinessKind = 'noStoreys' | 'noSpaces' | 'noMaterials' | 'noQuantities' | 'duplicateGlobalIds' | 'noStorey' | 'subReportDuplicates' | 'subReportGaps' | 'farElements' | 'boqMissingQuantity';

export interface ReadinessFinding {
  kind: ReadinessKind;
  /** Catalogue keys: what is missing (`ready.<kind>`) and what is weaker because of it (`ready.<kind>.effect`). */
  key: `ready.${ReadinessKind}`;
  effectKey: `ready.${ReadinessKind}.effect`;
  params: Record<string, number | string>;
}

const finding = (kind: ReadinessKind, params: Record<string, number | string>): ReadinessFinding => ({ kind, key: `ready.${kind}`, effectKey: `ready.${kind}.effect`, params });

/**
 * The findings, in the order the draft set depends on them: levels first (a plan per level),
 * then rooms, then what the schedules read. An empty model (no element, no room) has nothing to report.
 * `subReports` are the checks of the schedules that are split into parts (`checkSubReports`): a duplicated or
 * missing element is said after the model's own findings, one pair of findings per split schedule.
 * `boq` is what the bill of quantities could not state (`boqMissing`, #75): the elements missing a quantity an article takes, said last.
 */
export function modelReadiness(f: ModelFacts, subReports: readonly SubReportCheck[] = [], boq?: BoqMissing): ReadinessFinding[] {
  if (f.elements === 0 && f.spaces === 0 && f.storeys === 0) return [];
  const out: ReadinessFinding[] = [];
  if (f.storeys === 0) out.push(finding('noStoreys', {}));
  if (f.spaces === 0) out.push(finding('noSpaces', {}));
  if (f.elements > 0) {
    if (f.elementsWithoutStorey > 0) out.push(finding('noStorey', { count: f.elementsWithoutStorey, total: f.elements }));
    if (f.elementsWithoutMaterial > 0) out.push(finding('noMaterials', { count: f.elementsWithoutMaterial, total: f.elements }));
    if (f.elementsWithoutQuantities > 0) out.push(finding('noQuantities', { count: f.elementsWithoutQuantities, total: f.elements }));
  }
  if (f.duplicateGlobalIds > 0) out.push(finding('duplicateGlobalIds', { count: f.duplicateGlobalIds, entities: f.duplicatedEntities }));
  if (f.farElements && f.farElements.length > 0) out.push(finding('farElements', farElementParams(f.farElements)));
  for (const c of subReports) {
    if (c.duplicates.length > 0) out.push(finding('subReportDuplicates', subReportParams(c.duplicates, c.parent.name)));
    if (c.gaps.length > 0) out.push(finding('subReportGaps', subReportParams(c.gaps, c.parent.name)));
  }
  if (boq && boq.elements > 0) out.push(finding('boqMissingQuantity', { count: boq.elements, articles: boq.articles, list: boq.list }));
  return out;
}

/** How many far elements the sentence names; the rest are counted. */
const NAMED_FAR_ELEMENTS = 8;

const metres = (m: number): string => `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10} m`;

/** The parameters of the far-element finding: the count, the farthest distance and each element named with its distance. */
function farElementParams(elements: readonly FarElementFact[]): Record<string, number | string> {
  const named = elements.slice(0, NAMED_FAR_ELEMENTS).map((e) => `'${e.label}' (${metres(e.distance)})`);
  const rest = elements.length - named.length;
  return {
    count: elements.length,
    distance: metres(Math.max(...elements.map((e) => e.distance))),
    list: named.join(', ') + (rest > 0 ? `, … +${rest}` : ''),
  };
}

/** The English of every finding's two sentences, by catalogue key; the app's English catalogue spreads this, so it is the one copy. */
export const READINESS_EN = {
  'ready.noStoreys': 'The model has no building storeys.',
  'ready.noStoreys.effect': 'The set starts with no floor plans (one is made per storey) and sections get no level marks.',
  'ready.noSpaces': 'The model has no rooms (IfcSpace).',
  'ready.noSpaces.effect': 'TAGALL has no rooms to label, so room labels and the check for unlabelled rooms have nothing to work on.',
  'ready.noStorey': '{count} of {total} elements are on no storey.',
  'ready.noStorey.effect': 'The joinery schedule shows a dash in their Level column, and a label\'s Storey field stays empty.',
  'ready.noMaterials': '{count} of {total} elements have no material.',
  'ready.noMaterials.effect': 'The material takeoff leaves them out, and a label\'s Material field stays empty.',
  'ready.noQuantities': '{count} of {total} elements have no quantity set (Qto).',
  'ready.noQuantities.effect': 'The material takeoff has no volume or area for them.',
  'ready.duplicateGlobalIds': '{count} GlobalIds are shared by {entities} entities.',
  'ready.duplicateGlobalIds.effect': 'A tag or label finds its element by GlobalId, so it can point at the wrong one of those that share it.',
  'ready.subReportDuplicates': 'In "{schedule}", more than one part lists the same type or element ({parts}). Types: {types}, elements: {count}: {list}.',
  'ready.subReportDuplicates.effect': 'They are counted twice when the parts are added up, and drawn on two sheets.',
  'ready.subReportGaps': 'In "{schedule}", some elements are in no part. Types: {types}, elements: {count}: {list}.',
  'ready.farElements': '{count} elements lie up to {distance} from the building: {list}.',
  'ready.farElements.effect': 'Views are framed without them, so the scale and the paper suit the building. They stay in the model, the schedules and the quantities, and are drawn where they fall inside the frame. The project setting "include far-away elements in framing" (--include-far-elements on the command line) frames them again.',
  'ready.boqMissingQuantity': '{count} elements lack a quantity that an article of the bill of quantities takes: {list}.',
  'ready.boqMissingQuantity.effect': 'The bill of quantities leaves them out of those articles\' totals. They are not counted as zero: the articles\' quantities are short by what these elements hold.',
  'ready.subReportGaps.effect': 'The parts do not add up to the schedule: those doors and windows are on no sheet.',
} as const;

/** A finding in English: what is missing, and what is weaker for it. */
export function describeReadiness(f: ReadinessFinding): { missing: string; effect: string } {
  const say = (text: string) => text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in f.params ? String(f.params[name]) : whole));
  return { missing: say(READINESS_EN[f.key]), effect: say(READINESS_EN[f.effectKey]) };
}
