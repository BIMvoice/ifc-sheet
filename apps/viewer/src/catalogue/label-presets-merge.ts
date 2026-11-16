/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Merging the label presets of an incoming library into a project's (#828). A preset is known by its name (case and spacing aside):
 * a clash keeps the project's (`mine`), takes the incoming groups (`theirs`, keeping the project's id) or keeps both, the incoming
 * one under a name that is free (`both`).
 */

import type { LabelPreset } from '@bimvoice/ifcsheet';
import type { ClashPolicy, KindReport } from './catalogue-merge';

const key = (p: LabelPreset): string => p.name.toLowerCase().replace(/\s+/g, ' ').trim();

export function mergeLabelPresets(mine: readonly LabelPreset[], theirs: readonly LabelPreset[], policy: ClashPolicy, fresh: (prefix: string) => string): { list: LabelPreset[]; report: KindReport } {
  const list = [...mine];
  const report: KindReport = { added: 0, kept: 0, replaced: 0, renamed: 0 };
  for (const incoming of theirs) {
    const at = list.findIndex((p) => key(p) === key(incoming));
    const id = list.some((p) => p.id === incoming.id) ? fresh('labelpreset') : incoming.id;
    if (at < 0) {
      list.push({ ...incoming, id });
      report.added++;
    } else if (policy === 'mine' || JSON.stringify(list[at].groups) === JSON.stringify(incoming.groups)) {
      report.kept++;
    } else if (policy === 'theirs') {
      list[at] = { ...incoming, id: list[at].id };
      report.replaced++;
    } else {
      let name = `${incoming.name} (2)`;
      for (let n = 3; list.some((p) => key(p) === key({ ...incoming, name })); n++) name = `${incoming.name} (${n})`;
      list.push({ ...incoming, id, name });
      report.renamed++;
    }
  }
  return { list, report };
}
