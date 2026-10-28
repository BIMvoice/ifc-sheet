/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The office's classification mappings as project edits (#89). They are the project's `classificationMappings` (saved with it, carried in a
 * `.bvlib` library). A mapping starts with no rules: IfcSheet ships no Uniclass or OmniClass table (both are licensed); the office types its
 * codes or imports them from a CSV (`importClassificationCsv`).
 */

import {
  freshProjectId, matchKey, parseClassificationRows, withRule,
  type ClassificationBy, type ClassificationMapping, type ClassificationProblem, type ScheduleClassification,
} from '@bimvoice/ifcsheet';
import { splitCsvRows } from '@/components/viewer/schedule/import/csv';
import { updateSchedule } from '@/joinery/schedules';
import { useProjectStore } from '@/project/project-store';

const write = (classificationMappings: ClassificationMapping[]): void => useProjectStore.setState({ classificationMappings, dirty: true });
const mappings = (): ClassificationMapping[] => useProjectStore.getState().classificationMappings ?? [];
const change = (id: string, edit: (m: ClassificationMapping) => ClassificationMapping): void => write(mappings().map((m) => (m.id === id ? edit(m) : m)));

/** A new, empty mapping for a system; returns its id. */
export function addClassificationMapping(name: string, edition = ''): string {
  const id = freshProjectId('class');
  write([...mappings(), { id, system: { name: name.trim() || 'Classification', ...(edition.trim() ? { edition: edition.trim() } : {}) }, rules: [] }]);
  return id;
}

export function renameClassificationSystem(id: string, name: string, edition: string): void {
  change(id, (m) => ({ ...m, system: { name: name.trim() || m.system.name, ...(edition.trim() ? { edition: edition.trim() } : {}) } }));
}

export function removeClassificationMapping(id: string): void {
  write(mappings().filter((m) => m.id !== id));
  // A schedule that showed it falls back to the model's own references.
  for (const s of useProjectStore.getState().schedules ?? []) if (s.classification?.mapping === id) setScheduleClassification(s.id, { ...s.classification, mapping: undefined });
}

/** Set the code of a class, type or material; an empty code removes the rule. */
export function setClassificationRule(id: string, by: ClassificationBy, match: string, code: string, title = ''): void {
  change(id, (m) => withRule(m, by, match, code, title));
}

/** One code for several items at once (every class of a kind of element, say): the bulk assignment. */
export function assignClassificationCode(id: string, by: ClassificationBy, matches: readonly string[], code: string, title = ''): void {
  change(id, (m) => matches.reduce((acc, match) => withRule(acc, by, match, code, title), m));
}

/** The rule of `by`/`match` in the mapping, if any. */
export function classificationRuleOf(m: ClassificationMapping | undefined, by: ClassificationBy, match: string): { code: string; title: string } | undefined {
  const key = matchKey(by, match);
  const rule = m?.rules.find((r) => r.by === by && matchKey(by, r.match) === key);
  return rule ? { code: rule.code, title: rule.title ?? '' } : undefined;
}

export interface ClassificationImportReport {
  /** Rules taken from the file and set. */
  imported: number;
  /** Rows not taken, with the reason; the file is read whole and nothing is dropped unlisted. */
  problems: ClassificationProblem[];
}

const delimiterOf = (text: string): string => {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
};

/** Import the rules of a CSV (`code`, `title`, `class` / `type` / `material`) into a mapping; a code already set for the same target is replaced. */
export function importClassificationCsv(id: string, text: string): ClassificationImportReport {
  const { rules, problems } = parseClassificationRows(splitCsvRows(text, delimiterOf(text)));
  if (rules.length > 0) change(id, (m) => rules.reduce((acc, r) => withRule(acc, r.by, r.match, r.code, r.title ?? ''), m));
  return { imported: rules.length, problems };
}

/** What a quantities-by-type schedule shows of classification; `undefined` for the table as it was. */
export function setScheduleClassification(scheduleId: string, choice: ScheduleClassification | undefined): void {
  const next = choice ? { ...(choice.mapping ? { mapping: choice.mapping } : {}), ...(choice.group ? { group: true } : {}) } : undefined;
  updateSchedule(scheduleId, { classification: next });
}

/** The mapping tags and labels read (`{Classification}`, the "Code" tag field): the first of the list, so this moves one there. */
export function useClassificationOnTags(id: string): void {
  const all = mappings();
  const at = all.findIndex((m) => m.id === id);
  if (at > 0) write([all[at], ...all.slice(0, at), ...all.slice(at + 1)]);
}
