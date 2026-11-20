/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Parametric text on a sheet (#143): a text draft marked `ptext` whose stored
 * words may name parameters, `Phase: {Phase}`. The sheet prints it resolved,
 * live, so a changed value shows on every sheet at once; the draft keeps the
 * template, which is what a selection edits. Since #832 every text on a sheet or
 * a view reads the same names, `ptext` only marks the ones the tool made.
 */

import type { DraftEntity } from '@/drafting/types';
import { resolvedTextDraft } from '@bimvoice/ifcsheet';

/** The draft parameter that marks a text as parametric. */
export const PARAMETRIC_TEXT = 'ptext';

export const isParametricText = (d: DraftEntity): boolean => d.shape.type === 'text' && d.params[PARAMETRIC_TEXT] === true;

/**
 * `d` as the paper prints it: every text has its `{Name}`s filled in (#832; before, only a `ptext` did), anything else is as it is.
 * The engine's one function, so the PDF and DXF print what the sheet shows.
 */
export const resolvedDraft = resolvedTextDraft;

/** Every text, on a sheet or a view, with `change` applied to its words: renaming a value follows every note that names it (#832). */
export function renameInParametricDrafts(drafts: readonly DraftEntity[], change: (text: string) => string): DraftEntity[] {
  return drafts.map((d) => {
    if (d.shape.type !== 'text') return d;
    const text = change(d.shape.text);
    return text === d.shape.text ? d : { ...d, shape: { ...d.shape, text } };
  });
}
