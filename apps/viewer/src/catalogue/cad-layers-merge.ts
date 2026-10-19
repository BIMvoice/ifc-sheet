/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Merging an incoming CAD layer table (`project/cad-layers.ts`) into a
 * project's. Rules have no names: two rules are the same rule when they
 * match the same things (source, kind, classes, material). The policies are
 * those of `catalogue-merge.ts`: on such a clash `mine` keeps the project's
 * rule, `theirs` replaces it in place (the order is the project's), `both`
 * appends the incoming one after (it only matters when it differs, and it
 * can never win against the earlier rule). Rules that clash with nothing are
 * appended in the file's order.
 */

import type { CadLayerRule } from '@/project/cad-layers';
import type { ClashPolicy, KindReport } from './catalogue-merge';

const criteria = (r: CadLayerRule) => JSON.stringify([
  r.source?.trim().toLowerCase() ?? '', r.kind ?? '', [...(r.ifcClasses ?? [])].map((c) => c.toUpperCase()).sort(), r.material?.trim().toLowerCase() ?? '',
]);
const outcome = (r: CadLayerRule) => JSON.stringify([r.layer, r.color, r.lineWeight, r.lineType]);

export function mergeCadLayers(
  mine: readonly CadLayerRule[], theirs: readonly CadLayerRule[], policy: ClashPolicy, fresh: (prefix: string) => string,
): { list: CadLayerRule[]; report: KindReport } {
  const list = [...mine];
  const report: KindReport = { added: 0, kept: 0, replaced: 0, renamed: 0 };
  for (const t of theirs) {
    const at = list.findIndex((m) => criteria(m) === criteria(t));
    const id = list.some((m) => m.id === t.id) ? fresh('cad') : t.id;
    if (at < 0) {
      list.push({ ...t, id });
      report.added++;
    } else if (policy === 'mine' || outcome(list[at]) === outcome(t)) {
      report.kept++;
    } else if (policy === 'theirs') {
      list[at] = { ...t, id: list[at].id };
      report.replaced++;
    } else {
      list.push({ ...t, id });
      report.renamed++;
    }
  }
  return { list, report };
}
