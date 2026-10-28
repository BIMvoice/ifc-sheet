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

/** An element tag: a leader that names an element. */
export const isElementTag = (d: DraftEntity): boolean => typeof d.params.tagOf === 'string' && d.shape.type === 'leader';

/** The text written over the model's, or null when the tag shows the model's. */
export function tagOverrideOf(d: DraftEntity): string | null {
  const v = d.params[TAG_OVERRIDE];
  return isElementTag(d) && typeof v === 'string' ? v : null;
}

/** The tag showing `text` in place of the model's value. A blank text is no override: the tag is left as it is. */
export function withTagOverride(d: DraftEntity, text: string): DraftEntity {
  if (!isElementTag(d) || d.shape.type !== 'leader' || !text.trim()) return d;
  return { ...d, shape: { ...d.shape, text }, params: { ...d.params, [TAG_OVERRIDE]: text } };
}

/** The tag showing the model's text again (`modelText`; null when the element is gone, which keeps the text it has). */
export function withoutTagOverride(d: DraftEntity, modelText: string | null): DraftEntity {
  if (tagOverrideOf(d) === null || d.shape.type !== 'leader') return d;
  const { [TAG_OVERRIDE]: _gone, ...params } = d.params;
  return { ...d, shape: modelText === null ? d.shape : { ...d.shape, text: modelText }, params };
}

/** What a tag should read now: its override, else the model's text (null when neither is known). */
export function tagTextNow(d: DraftEntity, modelText: string | null): string | null {
  return tagOverrideOf(d) ?? modelText;
}
