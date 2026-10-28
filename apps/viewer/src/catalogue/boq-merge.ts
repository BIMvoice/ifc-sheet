/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Merging the bill of quantities' articles of an incoming library into a project's (#75). An article is the same article when its CODE agrees
 * (case and spacing aside), the office's own code being what it is known by; a clash follows the policy as every other definition does:
 * `mine` keeps the project's, `theirs` replaces it (keeping the project's id), `both` keeps both. A code is the office's: it is never renamed
 * to "(2)", so under `both` the incoming article joins the table with the same code, a second row for it (an article can take several kinds
 * of element). An article without a code cannot clash and is added.
 */

import type { BoqArticle } from '@bimvoice/ifcsheet';
import type { ClashPolicy, KindReport } from './catalogue-merge';

const codeKey = (code: string): string => code.trim().toLowerCase().replace(/\s+/g, ' ');
const sameDefinition = (a: BoqArticle, b: BoqArticle): boolean => JSON.stringify({ ...a, id: '' }, Object.keys({ ...a, id: '' }).sort()) === JSON.stringify({ ...b, id: '' }, Object.keys({ ...a, id: '' }).sort());

export function mergeBoqArticles(mine: readonly BoqArticle[], theirs: readonly BoqArticle[], policy: ClashPolicy, fresh: (prefix: string) => string): { list: BoqArticle[]; report: KindReport } {
  const list = [...mine];
  const report: KindReport = { added: 0, kept: 0, replaced: 0, renamed: 0 };
  for (const incoming of theirs) {
    const id = list.some((a) => a.id === incoming.id) ? fresh('boq') : incoming.id;
    const at = codeKey(incoming.code) ? list.findIndex((a) => codeKey(a.code) === codeKey(incoming.code)) : -1;
    if (at < 0) { list.push({ ...incoming, id }); report.added++; }
    else if (policy === 'mine' || sameDefinition(list[at], incoming)) report.kept++;
    else if (policy === 'theirs') { list[at] = { ...incoming, id: list[at].id }; report.replaced++; }
    else { list.push({ ...incoming, id }); report.added++; }
  }
  return { list, report };
}
