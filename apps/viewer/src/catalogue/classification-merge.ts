/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Merging the classification mappings of an incoming library into a project's (#89). A mapping is the office's table for ONE system, so two
 * mappings are the same mapping when their system agrees (name and edition, case and spacing aside). A clash follows the policy: `mine` keeps
 * the project's table, `theirs` replaces its rules (keeping the project's id, so schedules that show it keep showing it), and `both` has no
 * second place to put a second table for one system, so it joins them: the rules for targets the project has no code for are added, and where
 * both have a code the project's stays.
 */

import { matchKey, systemLabel, type ClassificationMapping } from '@bimvoice/ifcsheet';
import type { ClashPolicy, KindReport } from './catalogue-merge';

const systemKey = (m: ClassificationMapping): string => systemLabel(m.system).toLowerCase().replace(/\s+/g, ' ').trim();
const same = (a: ClassificationMapping, b: ClassificationMapping): boolean => JSON.stringify(a.rules) === JSON.stringify(b.rules);

export function mergeClassificationMappings(mine: readonly ClassificationMapping[], theirs: readonly ClassificationMapping[], policy: ClashPolicy, fresh: (prefix: string) => string): { list: ClassificationMapping[]; report: KindReport } {
  const list = [...mine];
  const report: KindReport = { added: 0, kept: 0, replaced: 0, renamed: 0 };
  for (const incoming of theirs) {
    const at = list.findIndex((m) => systemKey(m) === systemKey(incoming));
    if (at < 0) {
      list.push({ ...incoming, id: list.some((m) => m.id === incoming.id) ? fresh('class') : incoming.id });
      report.added++;
    } else if (policy === 'mine' || same(list[at], incoming)) {
      report.kept++;
    } else if (policy === 'theirs') {
      list[at] = { ...incoming, id: list[at].id };
      report.replaced++;
    } else {
      const have = new Set(list[at].rules.map((r) => `${r.by}|${matchKey(r.by, r.match)}`));
      const extra = incoming.rules.filter((r) => !have.has(`${r.by}|${matchKey(r.by, r.match)}`));
      if (extra.length > 0) { list[at] = { ...list[at], rules: [...list[at].rules, ...extra] }; report.added++; }
      else report.kept++;
    }
  }
  return { list, report };
}
