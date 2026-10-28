/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Classification mapping (#89): the office's own table from what the model holds (an IFC class, a type, a material) to the code of a
 * classification system it works in (Uniclass, OmniClass, an office system). IfcSheet ships NO code table: Uniclass and OmniClass are
 * licensed, so the office types its codes or imports them from a CSV (`parseClassificationRows`).
 *
 * ONE function answers "which code does this element have": {@link classificationOf}. Tags, schedules, the CSV and XLSX and the
 * command line all call it, so they cannot disagree. Its rule:
 *
 *  1. The MODEL wins. An IfcClassificationReference the element carries (its own, or its type's) is the code, when the reference names
 *     no system or names one of the systems being resolved. A reference of another system is not an answer to "the Uniclass code".
 *  2. Else the first mapping with a rule for the element: by TYPE name, else by MATERIAL name, else by IFC CLASS (the most specific
 *     rule speaks).
 *  3. Else nothing (`null`).
 *
 * Pure: the model comes in through {@link ClassificationModel}; `classification-read.ts` makes one from a parsed model.
 */

import type { BoqElement } from './boq-compute.js';
import { classKey, materialKey } from './style-rules.js';

/** The classification system a mapping speaks, as the office names it: `Uniclass`, edition `2015`. */
export interface ClassificationSystem {
  name: string;
  edition?: string;
}

/** What a rule matches. */
export const CLASSIFICATION_BY = ['class', 'type', 'material'] as const;
export type ClassificationBy = (typeof CLASSIFICATION_BY)[number];

/** One rule: the IFC class, type or material named `match` has `code` (and a `title`, which may be empty). */
export interface ClassificationRule {
  by: ClassificationBy;
  match: string;
  code: string;
  title?: string;
}

/** The office's table for one system. */
export interface ClassificationMapping {
  id: string;
  system: ClassificationSystem;
  rules: ClassificationRule[];
}

/** The text a system is shown as: `Uniclass 2015`. */
export const systemLabel = (system: ClassificationSystem): string => (system.edition ? `${system.name} ${system.edition}` : system.name);

/** What an element is, for the rules and the model's references. */
export interface ClassifiedElement {
  /** The IFC class as declared, `IfcWall`. */
  className: string;
  /** Its defining type's name; empty or absent without one. */
  typeName?: string | null;
  /** The names of its materials. */
  materials?: readonly string[];
  /** Which model and which entity, for a {@link ClassificationModel} to look up. */
  modelId?: string;
  expressId?: number;
}

/** An IfcClassificationReference as the parser reads it (`ClassificationInfo` is this). */
export interface ModelClassificationRef {
  /** The IfcClassification it belongs to, when the reference names it. */
  system?: string;
  /** Its Identification (IFC4; ItemReference in IFC2X3): the code. */
  identification?: string;
  /** Its Name: the title. */
  name?: string;
  description?: string;
  /** The reference exists but its attributes could not be read. */
  unresolved?: boolean;
}

/** The references a model holds for an element, its own and its type's. */
export interface ClassificationModel {
  referencesOf(element: ClassifiedElement): readonly ModelClassificationRef[];
}

/** The answer: the code, its title, and where it came from. */
export interface ClassificationResult {
  code: string;
  title: string;
  source: 'model' | 'mapping';
  /** The system as the model's reference names it, or as the mapping does. May be empty (a reference that names none). */
  system: string;
}

const systemKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Whether a reference of system `refSystem` speaks for `mappings`: it names no system, or one of theirs (`Uniclass` for `Uniclass 2015`, either way round). With no mapping, every reference counts. */
function speaksFor(refSystem: string | undefined, mappings: readonly ClassificationMapping[]): boolean {
  const ref = systemKey(refSystem ?? '');
  if (!ref || mappings.length === 0) return true;
  return mappings.some((m) => {
    const own = systemKey(m.system.name);
    const full = systemKey(systemLabel(m.system));
    return ref === own || ref === full || (own.length > 0 && (ref.includes(own) || own.includes(ref)));
  });
}

/** How a rule's `match` and an element's name compare: a class ignores `StandardCase`, a type or material case and spacing. */
export const matchKey = (by: ClassificationBy, name: string): string => (by === 'class' ? classKey(name) : materialKey(name));

/** The rule of `mapping` for `by` and `name`, or undefined. */
export function classificationRuleOf(mapping: ClassificationMapping, by: ClassificationBy, name: string): ClassificationRule | undefined {
  const key = matchKey(by, name);
  return key ? mapping.rules.find((r) => r.by === by && matchKey(by, r.match) === key) : undefined;
}

function fromModel(refs: readonly ModelClassificationRef[], mappings: readonly ClassificationMapping[]): ClassificationResult | null {
  for (const r of refs) {
    const code = r.identification?.trim();
    if (r.unresolved || !code || !speaksFor(r.system, mappings)) continue;
    return { code, title: (r.name ?? r.description ?? '').trim(), source: 'model', system: r.system?.trim() ?? '' };
  }
  return null;
}

function fromMapping(element: ClassifiedElement, mapping: ClassificationMapping): ClassificationResult | null {
  const rule =
    (element.typeName ? classificationRuleOf(mapping, 'type', element.typeName) : undefined) ??
    (element.materials ?? []).map((m) => classificationRuleOf(mapping, 'material', m)).find((r) => r !== undefined) ??
    classificationRuleOf(mapping, 'class', element.className);
  return rule ? { code: rule.code, title: rule.title ?? '', source: 'mapping', system: systemLabel(mapping.system) } : null;
}

/**
 * The classification of `element`: the model's own IfcClassificationReference, else the first of `mappings` with a rule for it (its type,
 * else its material, else its class); `null` when neither says. `mappings` are the systems being resolved (usually one); `model` may be
 * absent, and then only the mappings speak.
 */
export function classificationOf(
  element: ClassifiedElement,
  mappings: readonly ClassificationMapping[] | undefined,
  model?: ClassificationModel,
): ClassificationResult | null {
  const systems = mappings ?? [];
  const own = model ? fromModel(model.referencesOf(element), systems) : null;
  if (own) return own;
  for (const mapping of systems) {
    const found = fromMapping(element, mapping);
    if (found) return found;
  }
  return null;
}

/** The mapping a schedule or tag resolves with: the one with `id`, else none (the model's own references alone). */
export const mappingsFor = (all: readonly ClassificationMapping[] | undefined, id: string | undefined): ClassificationMapping[] => {
  const found = id ? all?.find((m) => m.id === id) : undefined;
  return found ? [found] : [];
};

// ----------------------------------------------------------------------------------------------------------------------------------
// What a project file and a library hold

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A rule as saved: null when it names no target or no code. */
export function readClassificationRule(raw: unknown): ClassificationRule | null {
  if (!isObject(raw)) return null;
  const by = CLASSIFICATION_BY.find((b) => b === raw.by);
  const match = text(raw.match), code = text(raw.code), title = text(raw.title);
  return by && match && code ? { by, match, code, ...(title ? { title } : {}) } : null;
}

/** A mapping as saved: null without an id or a system name; a damaged rule is dropped. */
export function readClassificationMapping(raw: unknown): ClassificationMapping | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id || !isObject(raw.system)) return null;
  const name = text(raw.system.name), edition = text(raw.system.edition);
  if (!name) return null;
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).flatMap((r) => readClassificationRule(r) ?? []);
  return { id: raw.id, system: { name, ...(edition ? { edition } : {}) }, rules };
}

/** The mappings of a project file or library; what is damaged is dropped. */
export function readClassificationMappings(raw: unknown): ClassificationMapping[] {
  return (Array.isArray(raw) ? raw : []).flatMap((m) => readClassificationMapping(m) ?? []);
}

/** `mapping` with the rule for (`by`, `match`) set to `code` and `title`; replaces the rule that matches the same target. An empty code removes it. */
export function withRule(mapping: ClassificationMapping, by: ClassificationBy, match: string, code: string, title = ''): ClassificationMapping {
  const key = matchKey(by, match);
  const rest = mapping.rules.filter((r) => !(r.by === by && matchKey(by, r.match) === key));
  const trimmed = code.trim();
  if (!trimmed || !key) return { ...mapping, rules: rest };
  const at = mapping.rules.findIndex((r) => r.by === by && matchKey(by, r.match) === key);
  const rule: ClassificationRule = { by, match: match.trim(), code: trimmed, ...(title.trim() ? { title: title.trim() } : {}) };
  const rules = [...rest];
  rules.splice(at < 0 ? rules.length : at, 0, rule);
  return { ...mapping, rules };
}

// ----------------------------------------------------------------------------------------------------------------------------------
// The CSV import

/** Why a row of the CSV was not taken. */
export type ClassificationProblemKind = 'noCodeColumn' | 'noTargetColumn' | 'missingCode' | 'noTarget' | 'manyTargets' | 'badClass' | 'duplicate';

export interface ClassificationProblem {
  /** The row's number in the file, counting the header as row 1; 0 for a problem of the file. */
  row: number;
  kind: ClassificationProblemKind;
  /** The value the message quotes: the class, the target. */
  detail?: string;
}

export interface ClassificationImport {
  rules: ClassificationRule[];
  /** Every row that was not taken, with the reason. Nothing is dropped without being listed. */
  problems: ClassificationProblem[];
}

const header = (s: string): string => s.toLowerCase().replace(/[^a-z0-9ăâîșşțţ]/g, '');
const ALIASES: Record<'code' | 'title' | ClassificationBy, readonly string[]> = {
  code: ['code', 'cod', 'identification', 'reference', 'notation'],
  title: ['title', 'titlu', 'name', 'description', 'denumire'],
  class: ['class', 'clasa', 'clasă', 'ifcclass'],
  type: ['type', 'tip', 'typename'],
  material: ['material'],
};

/**
 * The rules a CSV holds, from its rows (the header first; read them with the shared CSV reader): columns `code`, `title` (optional) and
 * `class`, `type` and/or `material`, exactly one of which is filled on each row. Headers match in English or Romanian, case and
 * punctuation aside. A row that cannot be taken is listed in `problems` with its number: a missing code, no target or two, a class that
 * is not an IFC class name, a target given a second time (the first row stands). Empty lines are skipped.
 */
export function parseClassificationRows(rows: readonly (readonly string[])[]): ClassificationImport {
  const out: ClassificationImport = { rules: [], problems: [] };
  const head = (rows[0] ?? []).map(header);
  const col = (name: keyof typeof ALIASES): number => head.findIndex((h) => ALIASES[name].map(header).includes(h));
  const code = col('code'), title = col('title');
  const targets = CLASSIFICATION_BY.map((by) => ({ by, at: col(by) })).filter((t) => t.at >= 0);
  if (code < 0) out.problems.push({ row: 0, kind: 'noCodeColumn' });
  if (targets.length === 0) out.problems.push({ row: 0, kind: 'noTargetColumn' });
  if (out.problems.length > 0) return out;
  const seen = new Set<string>();
  rows.slice(1).forEach((cells, i) => {
    const row = i + 2;
    if (cells.every((c) => c.trim() === '')) return;
    const given = targets.map((t) => ({ by: t.by, value: (cells[t.at] ?? '').trim() })).filter((t) => t.value !== '');
    const c = (cells[code] ?? '').trim();
    if (given.length === 0) return void out.problems.push({ row, kind: 'noTarget' });
    if (given.length > 1) return void out.problems.push({ row, kind: 'manyTargets', detail: given.map((g) => g.value).join(' / ') });
    const { by, value } = given[0];
    if (!c) return void out.problems.push({ row, kind: 'missingCode', detail: value });
    if (by === 'class' && !/^Ifc[A-Za-z0-9]+$/i.test(value)) return void out.problems.push({ row, kind: 'badClass', detail: value });
    const key = `${by}|${matchKey(by, value)}`;
    if (seen.has(key)) return void out.problems.push({ row, kind: 'duplicate', detail: value });
    seen.add(key);
    const t = title >= 0 ? (cells[title] ?? '').trim() : '';
    out.rules.push({ by, match: value, code: c, ...(t ? { title: t } : {}) });
  });
  return out;
}

// ----------------------------------------------------------------------------------------------------------------------------------
// The model's types with their codes (the command line, and the test that the app agrees)

/** One type (or, without a type, one class) of the model with the code its elements have. */
export interface ClassifiedType {
  className: string;
  /** The type's name; null for the elements without a type. */
  typeName: string | null;
  code: string;
  title: string;
  source: 'model' | 'mapping' | 'none';
  count: number;
}

/**
 * The elements of the models grouped by type (by class for an element without one) and by the code they have, in the order of the
 * model's classes then names. An element the classification does not reach has the code `''` and the source `none`.
 */
export function classifiedTypes(elements: readonly BoqElement[], mappings: readonly ClassificationMapping[] | undefined, model?: ClassificationModel): ClassifiedType[] {
  const groups = new Map<string, ClassifiedType>();
  for (const e of elements) {
    const r = classificationOf({ className: e.ifcClass, typeName: e.typeName, materials: e.materials, modelId: e.modelId, expressId: e.expressId }, mappings, model);
    const className = e.typeName !== null ? (e.typeClass ?? e.ifcClass) : e.ifcClass;
    const key = `${className}|${e.typeName ?? ''}|${r?.code ?? ''}`;
    const group = groups.get(key) ?? { className, typeName: e.typeName, code: r?.code ?? '', title: r?.title ?? '', source: r?.source ?? 'none', count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.typeName === null) - Number(b.typeName === null) || a.className.localeCompare(b.className) || (a.typeName ?? '').localeCompare(b.typeName ?? '') || a.code.localeCompare(b.code));
}
