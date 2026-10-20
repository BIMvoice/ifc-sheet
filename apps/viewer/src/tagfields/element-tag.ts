/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What an element tag (the TAG tool) shows: the element's mark, name or IFC
 * class. A field the office has set in the tag-field sources (`tag-fields.ts`)
 * reads those sources, as the labels do; a field it has not set reads what the
 * TAG tool always showed (`tagToolDefaultSources`: the Tag as written, the
 * Name), so tags already on sheets keep their text until someone opts in. The
 * mark falls back to the name. Edits show, as in the lists the labels read.
 */

import { labelElementByGlobalId } from '@/labels/label-element';
import { readStored } from '@/labels/label-resolve';
import { elementClassLabel } from '@/project/element-label';
import { firstValue, tagKindOf, tagToolSourcesOf, type TagFieldId } from './tag-fields';

export type TagField = 'mark' | 'name' | 'class';

export const TAG_FIELDS: readonly TagField[] = ['mark', 'name', 'class'];

/** The text of an element tag, or null when the element is no longer in the model. */
export function elementLabel(globalId: string, field: TagField): string | null {
  if (field === 'class') return elementClassLabel(globalId);
  const el = labelElementByGlobalId(globalId);
  if (!el) return null;
  const kind = tagKindOf(el.className());
  const read = (f: TagFieldId): string => String(firstValue(tagToolSourcesOf(el.tagFields, kind, f), (ref) => readStored(ref, el)).value ?? '');
  const name = read('name');
  if (field === 'name') return name || '?';
  return read('mark') || name || '?';
}
