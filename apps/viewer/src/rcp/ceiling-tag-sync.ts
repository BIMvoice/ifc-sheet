/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A ceiling tag says its height in the language's separators ("+2,70" /
 * "+2.70", #269). CEILTAG keeps the height in metres on the text
 * (`params.ceilingHeight`), so a language switch re-writes the text, like a
 * parametric label's numbers: derived data, no undo step. A tag from before
 * the height was kept keeps what it says.
 */

import type { DraftEntity } from '@/drafting/types';
import { useProjectStore } from '@/project/project-store';
import { ceilingHeightText } from './ceiling-tags';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';

/** `drafts` with every ceiling tag that knows its height written in `locale`; the same array when nothing changed. */
export function settleCeilingTags(drafts: DraftEntity[], locale: SheetLocale): DraftEntity[] {
  let changed = false;
  const next = drafts.map((d) => {
    const height = d.params.ceilingHeight;
    if (d.shape.type !== 'text' || typeof d.params.ceilingOf !== 'string' || typeof height !== 'number' || !Number.isFinite(height)) return d;
    const text = ceilingHeightText(height, locale);
    if (text === d.shape.text) return d;
    changed = true;
    return { ...d, shape: { ...d.shape, text } };
  });
  return changed ? next : drafts;
}

export function refreshCeilingTags(locale: SheetLocale): void {
  const { drafts } = useProjectStore.getState();
  const next = settleCeilingTags(drafts, locale);
  if (next !== drafts) useProjectStore.setState({ drafts: next, dirty: true });
}
