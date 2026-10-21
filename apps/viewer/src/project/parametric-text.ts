/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Parametric text on a sheet (#143): a text draft marked `ptext` whose stored
 * words may name parameters, `Phase: {Phase}`. The sheet prints it resolved,
 * live, so a changed value shows on every sheet at once; the draft keeps the
 * template, which is what a selection edits.
 */

import type { DraftEntity } from '@/drafting/types';
import { resolveParamText } from './title-block-params';

/** The draft parameter that marks a text as parametric. */
export const PARAMETRIC_TEXT = 'ptext';

export const isParametricText = (d: DraftEntity): boolean => d.shape.type === 'text' && d.params[PARAMETRIC_TEXT] === true;

/** `d` as the paper prints it: a parametric text with its parameters filled in, anything else as it is. */
export function resolvedDraft(d: DraftEntity, lookup: (name: string) => string | undefined): DraftEntity {
  return d.shape.type === 'text' && isParametricText(d) ? { ...d, shape: { ...d.shape, text: resolveParamText(d.shape.text, lookup) } } : d;
}

/** Every parametric text with `change` applied to its words. */
export function renameInParametricDrafts(drafts: readonly DraftEntity[], change: (text: string) => string): DraftEntity[] {
  return drafts.map((d) => {
    if (d.shape.type !== 'text' || !isParametricText(d)) return d;
    const text = change(d.shape.text);
    return text === d.shape.text ? d : { ...d, shape: { ...d.shape, text } };
  });
}
