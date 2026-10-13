/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What WHATCHANGED prints: sheet by sheet, "A-101: 3 changes" and the list, in the person's language. */

import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import type { ModelChange } from './compare';
import type { SheetChanges } from './report';

const t = (key: string, params: Record<string, string | number> = {}) => resolve(`whatchanged.${key}` as TranslationKey, params);

/** How an element changed, in words: `moved, changed in Pset_WallCommon`. */
export function describeChange(c: Pick<ModelChange, 'kinds' | 'sets'>): string {
  return c.kinds.map((k) => t(`kind.${k}`, { sets: c.sets.join(', ') })).join(', ');
}

const labelOf = (c: Pick<ModelChange, 'name' | 'className'>) => c.name || c.className;

/** The lines for the sheets: each sheet's count, then what changed on it. A sheet with nothing says so. */
export function sheetLines(sheets: readonly SheetChanges[], viewName: (viewId: string) => string, changeOf: (guid: string) => ModelChange | undefined): string[] {
  if (sheets.every((s) => s.count === 0)) return [t('nothing')];
  return sheets.flatMap((s) => {
    if (s.count === 0) return [t('sheetNone', { number: s.number })];
    const seen = new Set<string>();
    const items = s.views.flatMap((v) => v.changes).filter((c) => !seen.has(c.guid) && seen.add(c.guid))
      .map((c) => t('item', { name: labelOf(c), class: c.className, what: describeChange(c) }));
    const annotations = s.annotations.map((a) => {
      const c = changeOf(a.guid);
      const name = c ? labelOf(c) : a.guid;
      return a.how === 'lost' ? t('annotationLost', { view: viewName(a.viewId), name }) : t('annotationChanged', { view: viewName(a.viewId), name, what: c ? describeChange(c) : '' });
    });
    return [t('sheet', { number: s.number, count: s.count }), ...items, ...annotations];
  });
}
