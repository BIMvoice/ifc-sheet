/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A tag's text written on the drawing instead of read from the model (#445). The tag keeps its element
 * (`tagOf`): the override is the person's text in `params.tagOverride`, and the leader's own text is
 * that text, so the sheet, the PDF and a headless build print what the editor shows with no second
 * lookup. "Reset to model value" removes the param and takes the model's text again. Pure.
 */

import type { DraftEntity } from './types';

export const TAG_OVERRIDE = 'tagOverride';

/** A parametric label (`labelOf`, stamped with its label type): a text read from its element, as TAGALL places them. */
export const isParametricLabel = (d: DraftEntity): boolean => d.shape.type === 'text' && typeof d.params.labelOf === 'string' && typeof d.params.atype === 'string';

/** A text that follows its element and so can be written over: a tag (a leader that names an element) or a parametric label (#542). */
export const isElementTag = (d: DraftEntity): boolean => (typeof d.params.tagOf === 'string' && d.shape.type === 'leader') || isParametricLabel(d);

const carriesText = (d: DraftEntity): d is DraftEntity & { shape: { type: 'leader' | 'text'; text: string } } => d.shape.type === 'leader' || d.shape.type === 'text';

/** The text written over the model's, or null when the tag shows the model's. */
export function tagOverrideOf(d: DraftEntity): string | null {
  const v = d.params[TAG_OVERRIDE];
  return isElementTag(d) && typeof v === 'string' ? v : null;
}

/** The tag showing `text` in place of the model's value. A blank text is no override: the tag is left as it is. */
export function withTagOverride(d: DraftEntity, text: string): DraftEntity {
  if (!isElementTag(d) || !carriesText(d) || !text.trim()) return d;
  return { ...d, shape: { ...d.shape, text }, params: { ...d.params, [TAG_OVERRIDE]: text } };
}

/** The tag showing the model's text again (`modelText`; null when the element is gone, or for a label, which the label sync re-reads, keeps the text it has). */
export function withoutTagOverride(d: DraftEntity, modelText: string | null): DraftEntity {
  if (tagOverrideOf(d) === null || !carriesText(d)) return d;
  const { [TAG_OVERRIDE]: _gone, ...params } = d.params;
  return { ...d, shape: modelText === null ? d.shape : { ...d.shape, text: modelText }, params } as DraftEntity;
}

/** What a tag should read now: its override, else the model's text (null when neither is known). */
export function tagTextNow(d: DraftEntity, modelText: string | null): string | null {
  return tagOverrideOf(d) ?? modelText;
}
