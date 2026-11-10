/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ByggesaksBIM readiness check (#372, Norway): the IDS file `byggesaksbim.ids` (the Obligatorisk items of DiBK's
 * P13 eByggesak report) run over the loaded models, and each requirement that fails said as a readiness finding. This file
 * is the pure half, one report in, findings out, so the app (which runs the IDS in its validation worker) and the command
 * line (which runs it in process) cannot say it differently. `run.ts` is the in-process half.
 */

import type { IDSValidationReport } from '@ifc-lite/ids';
import type { ReadinessFinding } from '../readiness.js';
import type { ByggesaksbimKind } from './byggesaksbim-text.js';

/** The specification identifiers of `byggesaksbim.ids`, in the file's order. */
export const BYGGESAKSBIM_SPECS = ['NO-H1', 'NO-H2', 'NO-H3', 'NO-H4', 'NO-H5', 'NO-H6', 'NO-H7'] as const;

/** The class each requirement is read from, for the ones that must have at least one (`minOccurs` 1 in the file). */
const MUST_EXIST: Readonly<Record<string, string>> = { 'NO-H1': 'IfcSite', 'NO-H2': 'IfcBuilding', 'NO-H3': 'IfcBuilding', 'NO-H4': 'IfcBuildingStorey', 'NO-H5': 'IfcBuildingStorey' };

/** How many failing elements a sentence names; the rest are counted. */
const NAMED = 8;

interface Tally { applicable: number; failed: number; named: string[]; guids: string[]; cardinalityFailed: number; models: number }

/**
 * The findings of the reports, one per failing requirement, in the file's order. One report per model: the counts and the
 * elements are summed over the models, and a requirement that needs an element to exist (a site, a building, a storey) is
 * said missing only when no model has one (discipline models of one building need not each carry a site).
 */
export function byggesaksbimFindings(reports: readonly IDSValidationReport[]): ReadinessFinding[] {
  const tally = new Map<string, Tally>();
  for (const report of reports) {
    for (const result of report.specificationResults) {
      const id = result.specification.identifier;
      if (id === undefined) continue;
      const t = tally.get(id) ?? { applicable: 0, failed: 0, named: [], guids: [], cardinalityFailed: 0, models: 0 };
      t.models++;
      t.applicable += result.applicableCount;
      if (result.cardinalityResult?.passed === false) t.cardinalityFailed++;
      for (const e of result.entityResults) {
        if (e.passed) continue;
        t.failed++;
        t.named.push(`'${e.entityName?.trim() || e.globalId || `#${e.expressId}`}'`);
        if (e.globalId) t.guids.push(e.globalId);
      }
      tally.set(id, t);
    }
  }
  const out: ReadinessFinding[] = [];
  for (const id of BYGGESAKSBIM_SPECS) {
    const t = tally.get(id);
    if (!t) continue;
    if (t.failed > 0) {
      const rest = t.failed - Math.min(t.failed, NAMED);
      const list = t.named.slice(0, NAMED).join(', ') + (rest > 0 ? `, … +${rest}` : '');
      const kind = `byggesaksbimH${id.slice(4)}` as ByggesaksbimKind;
      out.push({ kind, key: `ready.${kind}`, effectKey: `ready.${kind}.effect`, params: { count: t.failed, total: t.applicable, list }, ...(t.guids.length > 0 ? { guids: t.guids } : {}) });
    } else if (t.cardinalityFailed === t.models && MUST_EXIST[id]) {
      out.push({ kind: 'byggesaksbimNone', key: 'ready.byggesaksbimNone', effectKey: 'ready.byggesaksbimNone.effect', params: { class: MUST_EXIST[id] } });
    }
  }
  return dedupeNone(out);
}

/** Two requirements read from the same class (H2 and H3 from IfcBuilding) say "no IfcBuilding" once. */
function dedupeNone(findings: ReadinessFinding[]): ReadinessFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (f.kind !== 'byggesaksbimNone') return true;
    const cls = String(f.params.class);
    if (seen.has(cls)) return false;
    seen.add(cls);
    return true;
  });
}

/** The one schema the requirements are written for (`ifcVersion="IFC4"` in the file). */
export const BYGGESAKSBIM_SCHEMA = 'IFC4';

/** The finding for a model in a schema other than IFC4: said instead of the check, because the check would read it as IFC4. */
export function byggesaksbimSchemaFinding(schemas: readonly string[]): ReadinessFinding {
  return { kind: 'byggesaksbimSchema', key: 'ready.byggesaksbimSchema', effectKey: 'ready.byggesaksbimSchema.effect', params: { schema: [...new Set(schemas)].join(', ') } };
}

/** The finding for a check that threw: an empty list would read as "all good". */
export function byggesaksbimErrorFinding(error: unknown): ReadinessFinding {
  const reason = (error instanceof Error ? error.message : String(error)).trim() || 'unknown error';
  return { kind: 'byggesaksbimError', key: 'ready.byggesaksbimError', effectKey: 'ready.byggesaksbimError.effect', params: { reason } };
}

/** The schema of a data store as the check reads it; a store that does not say is not IFC4 (the IDS run defaults it to IFC4, which is how IFC2X3 slipped through). */
export const isByggesaksbimSchema = (schemaVersion: string | undefined): boolean => schemaVersion === BYGGESAKSBIM_SCHEMA;
