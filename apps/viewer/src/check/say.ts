/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A finding in words, and the findings grouped by sheet for CHECKSET. */

import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import type { ProjectSheet } from '@/project/types';
import type { Finding } from './types';

/** The message of a finding, in the person's language. */
export function describeFinding(f: Finding): string {
  const params: Record<string, string | number> = { ...f.params };
  if (typeof params.field === 'string') params.field = resolve(`sheets.tb.${params.field === 'title' ? 'title' : params.field}` as TranslationKey);
  if (typeof params.what === 'string') params.what = resolve(`check.what.${params.what}` as TranslationKey, { count: Number(params.count ?? 1) });
  if (f.kind === 'danglingAnnotation' && params.sheet === '') params.sheet = resolve('check.noSheetShort' as TranslationKey);
  return resolve(f.key as TranslationKey, params);
}

export interface FindingGroup { sheetId?: string; title: string; findings: Finding[] }

/** The findings of each sheet together, in the order of the set; those that belong to no sheet last. */
export function groupBySheet(findings: readonly Finding[], sheets: readonly ProjectSheet[]): FindingGroup[] {
  const groups: FindingGroup[] = [];
  for (const f of findings) {
    const sheet = sheets.find((s) => s.id === f.sheetId);
    const title = sheet ? `${sheet.number} ${sheet.name}` : resolve('check.noSheet' as TranslationKey);
    const g = groups.find((x) => x.sheetId === sheet?.id);
    if (g) g.findings.push(f);
    else groups.push({ sheetId: sheet?.id, title, findings: [f] });
  }
  return groups;
}

/** The lines CHECKSET prints. */
export function checkLines(findings: readonly Finding[], sheets: readonly ProjectSheet[]): string[] {
  if (findings.length === 0) return [resolve('check.none' as TranslationKey)];
  return [
    resolve('check.count' as TranslationKey, { count: findings.length }),
    ...groupBySheet(findings, sheets).flatMap((g) => [g.title, ...g.findings.map((f) => `  ${describeFinding(f)}${f.fix ? ` [${f.fix}]` : ''}`)]),
  ];
}
