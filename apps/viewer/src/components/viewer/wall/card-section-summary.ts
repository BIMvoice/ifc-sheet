/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a closed section of the schedule's viewport card says in one line (#290), and whether its settings are off the default.
 * Each line is read from the same fields the section edits, so a line cannot say something the section does not show. `changed`
 * is what opens a section nobody has touched.
 */

import { orderedRows, symbolsShown, type PropertyTest, type ScheduleContent, type SubReportFilter } from '@bimvoice/ifcsheet';
import type { TranslationKey, UseTranslationResult } from '@/i18n';

type T = UseTranslationResult['t'];
export interface Summary { text: string; changed: boolean }

const upFirst = (s: string): string => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const line = (parts: string[], fallback: string): Summary => ({ text: parts.length ? upFirst(parts.join(', ')) : fallback, changed: parts.length > 0 });

/** A test as one line: `IsExternal is true`. */
export const say = (t: PropertyTest, op: string): string => `${t.pset ? `${t.pset}.` : ''}${t.name} ${op}${t.op === 'present' ? '' : ` ${t.value ?? ''}`}`;

/** Whether a filter keeps only some of the elements. */
export const filterActive = (filter: SubReportFilter | undefined): boolean => !!(filter?.classes || filter?.predefined || filter?.properties?.length);

/** The rows, sort, numbering and symbols chosen for the table. */
export function contentSummary(content: ScheduleContent | undefined, textIds: readonly string[], t: T, propNames: readonly string[] = []): Summary {
  const rows = orderedRows(content, textIds, propNames);
  const hidden = rows.filter((r) => !r.shown).length;
  const natural = orderedRows(undefined, textIds, propNames);
  const parts: string[] = [];
  if (hidden > 0) parts.push(t('wall.section.content.hidden', { count: hidden }));
  if (rows.some((r, i) => r.id !== natural[i].id)) parts.push(t('wall.section.content.reordered'));
  const sort = content?.sort;
  if (sort) parts.push(t(sort.descending ? 'wall.section.content.sortedReverse' : 'wall.section.content.sorted', { by: t(`wall.section.content.by.${sort.by}` as TranslationKey) }));
  if (content?.numbering?.marks === 'sequence') parts.push(t('wall.section.content.sequence'));
  if (content?.numbering?.typeStart !== undefined) parts.push(t('wall.section.content.typeStart', { n: content.numbering.typeStart }));
  if (content?.numbering?.elementStart !== undefined) parts.push(t('wall.section.content.elementStart', { n: content.numbering.elementStart }));
  const symbols = symbolsShown(content);
  if (!symbols.elevation) parts.push(t('wall.section.content.noElevation'));
  if (!symbols.plan) parts.push(t('wall.section.content.noPlan'));
  return line(parts, t('wall.section.content.default'));
}

/** The classes, predefined types and property tests a schedule or part keeps. */
export function filterSummary(filter: SubReportFilter | undefined, opLabel: (op: PropertyTest['op']) => string, t: T): Summary {
  const list = (v: readonly string[]): string => (v.length ? v.join(', ') : t('wall.section.filter.nothing'));
  const parts: string[] = [];
  if (filter?.classes) parts.push(t('wall.section.filter.classes', { list: list(filter.classes) }));
  if (filter?.predefined) parts.push(t('wall.section.filter.predefined', { list: list(filter.predefined) }));
  for (const test of filter?.properties ?? []) parts.push(say(test, opLabel(test.op)));
  return { text: parts.length ? upFirst(parts.join('; ')) : t('wall.section.filter.none'), changed: parts.length > 0 };
}

/** How many text rows there are, and how many texts belong to types the model no longer lists. */
export function textSummary(rows: number, orphans: number, t: T): Summary {
  const parts: string[] = [];
  if (rows > 0) parts.push(t('wall.section.text.rows', { count: rows }));
  if (orphans > 0) parts.push(t('wall.section.text.orphans', { count: orphans }));
  return line(parts, t('wall.section.text.none'));
}

/** What a part keeps (kinds, storeys, types) or, for the schedule, how many parts it has; then the problem the check found. */
export function subSummary(
  input: { sub: { filter: SubReportFilter } | undefined; parts: number; levels: number; types: number; duplicates: boolean; gaps: boolean },
  t: T,
): Summary {
  const parts: string[] = [];
  let changed = false;
  if (input.sub) {
    const f = input.sub.filter;
    if (f.kinds) parts.push(t('wall.section.sub.kinds', { list: f.kinds.map((k) => t(k === 'door' ? 'wall.sub.doors' : 'wall.sub.windows')).join(', ') }));
    if (f.levels) parts.push(t('wall.section.sub.levels', { count: f.levels.length, total: input.levels }));
    if (f.types) parts.push(t('wall.section.sub.types', { count: f.types.length, total: input.types }));
    changed = parts.length > 0;
    if (!changed) parts.push(t('wall.section.sub.all'));
  } else {
    parts.push(input.parts > 0 ? t('wall.section.sub.parts', { count: input.parts }) : t('wall.section.sub.none'));
  }
  if (input.duplicates) parts.push(t('wall.section.sub.duplicates'));
  if (input.gaps) parts.push(t('wall.section.sub.gaps'));
  return { text: upFirst(parts.join(', ')), changed };
}
