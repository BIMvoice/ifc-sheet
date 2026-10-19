/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The CAD layer standard: a table of rules that say which CAD layer (name,
 * colour, pen, line type) a drawn thing goes on when a drawing is written
 * as DXF — and, later, DWG (#52). Pure: no store, no DOM, so any writer
 * calls `resolveCadLayer` the same way.
 *
 * A rule matches when every criterion it sets matches the thing:
 * - `source`: the drawing's own layer tag (`CUT`, `SEEN`, `HIDDEN`, `HATCH`,
 *   or the name of a drafting layer);
 * - `kind`: what a drafted annotation is (`dimension`, `text`, `hatch`);
 * - `ifcClasses`: the element's IFC class, any of the list;
 * - `material`: the element's IfcMaterial name.
 *
 * Order: rules that name a material come first, then rules that name a
 * class, then the rest; within each tier the table's own order, and the
 * first match wins. Nothing matching (or an empty table) means the fixed
 * layer the drawing code names, exactly as before.
 */

import type { LineType } from '@/drafting/styles';

export type CadKind = 'dimension' | 'text' | 'hatch';
export const CAD_KINDS: readonly CadKind[] = ['dimension', 'text', 'hatch'];

export interface CadLayerRule {
  id: string;
  source?: string;
  kind?: CadKind;
  /** IFC class names (`IfcWall`), compared case-insensitively. */
  ifcClasses?: string[];
  material?: string;
  /** The CAD layer name (stored as typed; the DXF writer folds it, see `cadLayerName`). */
  layer: string;
  /** True colour, `#rrggbb`; the ACI index is derived from it. Absent: the drawing's own. */
  color?: string;
  /** Pen, paper millimetres. Absent: the drawing's own. */
  lineWeight?: number;
  lineType?: LineType;
}

/** What a writer knows about a thing it is about to put on a layer. */
export interface CadSubject {
  source: string;
  kind?: string;
  ifcClass?: string;
  material?: string;
}

export interface CadLayerChoice {
  name: string;
  color?: string;
  lineWeight?: number;
  lineType?: LineType;
  rule: CadLayerRule;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const tier = (r: CadLayerRule) => (r.material?.trim() ? 0 : r.ifcClasses?.length ? 1 : 2);

/** A rule with no criterion would swallow everything: it never matches. */
const hasCriterion = (r: CadLayerRule) => !!(r.source?.trim() || r.kind || r.ifcClasses?.length || r.material?.trim());

/** The rules in the order they are tried: material rules, class rules, the rest; table order within each. */
export function cadRuleOrder(rules: readonly CadLayerRule[]): CadLayerRule[] {
  return rules.map((r, i) => ({ r, i })).sort((a, b) => tier(a.r) - tier(b.r) || a.i - b.i).map((x) => x.r);
}

function matches(r: CadLayerRule, s: CadSubject): boolean {
  if (!hasCriterion(r)) return false;
  if (r.source?.trim() && norm(r.source) !== norm(s.source)) return false;
  if (r.kind && r.kind !== s.kind) return false;
  if (r.ifcClasses?.length && !(s.ifcClass && r.ifcClasses.some((c) => c.trim().toUpperCase() === s.ifcClass?.toUpperCase()))) return false;
  if (r.material?.trim() && !(s.material && norm(r.material) === norm(s.material))) return false;
  return true;
}

/** The first rule matching `subject`, or null (the fixed layer stands). */
export function matchCadRule(rules: readonly CadLayerRule[], subject: CadSubject): CadLayerRule | null {
  return cadRuleOrder(rules).find((r) => matches(r, subject)) ?? null;
}

/** The layer a thing goes on under `rules`, or null when no rule says. */
export function resolveCadLayer(rules: readonly CadLayerRule[], subject: CadSubject): CadLayerChoice | null {
  const rule = matchCadRule(rules, subject);
  if (!rule) return null;
  const name = cadLayerName(rule.layer);
  if (!name) return null;
  return {
    name, rule,
    ...(rule.color ? { color: rule.color } : {}),
    ...(rule.lineWeight !== undefined ? { lineWeight: rule.lineWeight } : {}),
    ...(rule.lineType ? { lineType: rule.lineType } : {}),
  };
}

const ILLEGAL = /[<>/\\":;?*|=`,]/g;

/**
 * A layer name as the CAD file carries it: ASCII only. DXF R2000 text is
 * code-page dependent (this writer declares windows-1252, which has no ș ț ă),
 * and a name that does not survive the code page becomes `?`, which CAD
 * refuses in a layer name. So diacritics are folded to their base letter
 * (`ș`→`s`, `ț`→`t`, `ă`→`a`, `é`→`e`), anything else outside printable ASCII
 * becomes `_`, and the characters CAD forbids in layer names become `_`.
 * Deterministic: the same name always gives the same bytes. Two names that
 * differ only in diacritics land on one layer. Empty when nothing is left.
 */
export function cadLayerName(raw: string): string {
  const folded = raw.normalize('NFD').replace(/\p{M}+/gu, '');
  return folded.replace(/[^\x20-\x7e]/g, '_').replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim().slice(0, 255);
}
