/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The two project actions of a tag's written-over text (#445): write it, and take the model's value back. One undo step each. */

import { replaceDraft } from '@/drafting/draft-store';
import { withoutTagOverride, withTagOverride } from '@/drafting/tag-override';
import { elementLabel, TAG_FIELDS, type TagField } from '@/tagfields/element-tag';
import { useProjectStore } from './project-store';

const find = (id: string) => useProjectStore.getState().drafts.find((d) => d.id === id);

/** The tag `id` shows `text` in place of the model's value, and keeps its element. */
export function overrideTagText(id: string, text: string): void {
  const d = find(id);
  if (!d) return;
  const next = withTagOverride(d, text);
  if (next !== d) replaceDraft(next);
}

/** "Reset to model value": the tag `id` reads its element again. */
export function resetTagText(id: string): void {
  const d = find(id);
  if (!d) return;
  const field = (TAG_FIELDS as readonly string[]).includes(String(d.params.tagField)) ? (d.params.tagField as TagField) : 'mark';
  // A parametric label has no tag field: its sync re-reads the text once the override is gone (#542).
  const next = withoutTagOverride(d, typeof d.params.tagOf === 'string' ? elementLabel(String(d.params.tagOf), field) : null);
  if (next !== d) replaceDraft(next);
}
