/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where labels go: a label centred on a point, and which elements of a view a
 * "label all" gives a label (those of the class that carry none of this type yet).
 */

import { GLYPH_ASCENT, GLYPH_DESCENT, textBlock, type TextFrame } from '@/drafting/text-block';
import type { DraftEntity, Pt } from '@/drafting/types';

/** The anchor of a text (the baseline start of its first line) that centres the whole block on `centre`; `up` is the drawing's screen-up sign. */
export function centredAnchor(centre: Pt, text: string, height: number, frame: TextFrame | undefined, up: 1 | -1): Pt {
  const { box, lines } = textBlock(text, height, frame);
  const glyphTop = -GLYPH_ASCENT * height, glyphBottom = lines.at(-1)!.y + GLYPH_DESCENT * height;
  return { x: centre.x - (box.x1 - box.x0) / 2, y: centre.y + ((glyphTop + glyphBottom) / 2) * up };
}

export interface LabelTarget {
  guid: string;
  /** The IFC class as declared. */
  className: string;
  anchor: Pt;
}

/** The targets of a label type that have none of it yet, in the order given; `className` is compared as the same class whatever its case. */
export function planTagAll(targets: readonly LabelTarget[], className: string, typeId: string, drafts: readonly DraftEntity[]): LabelTarget[] {
  const done = new Set(drafts.filter((d) => d.params.atype === typeId && typeof d.params.labelOf === 'string').map((d) => String(d.params.labelOf)));
  const wanted = className.toLowerCase();
  const seen = new Set<string>();
  return targets.filter((t) => {
    if (t.className.toLowerCase() !== wanted || done.has(t.guid) || seen.has(t.guid)) return false;
    seen.add(t.guid);
    return true;
  });
}

/** The classes among the targets and how many elements each has, most first. */
export function classesOf(targets: readonly LabelTarget[]): { className: string; count: number }[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.guid)) continue;
    seen.add(t.guid);
    counts.set(t.className, (counts.get(t.className) ?? 0) + 1);
  }
  return [...counts].map(([className, count]) => ({ className, count })).sort((a, b) => b.count - a.count || a.className.localeCompare(b.className));
}
