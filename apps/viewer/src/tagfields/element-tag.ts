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
import { TAG_FIELDS as TAG_FIELD_NAMES, type TagFieldName } from '@/catalogue/types';
import { elementClassLabel } from '@/project/element-label';
import { firstValue, tagKindOf, tagToolSourcesOf, type TagFieldId } from './tag-fields';

/** The fields the TAG tool can show: the one list (`catalogue/types.ts`), so an annotation type and the tool offer the same. */
export type TagField = TagFieldName;

export const TAG_FIELDS: readonly TagField[] = TAG_FIELD_NAMES;

/** The text of an element tag, or null when the element is no longer in the model. */
export function elementLabel(globalId: string, field: TagField): string | null {
  if (field === 'class') return elementClassLabel(globalId);
  const el = labelElementByGlobalId(globalId);
  if (!el) return null;
  // The classification (#89) is the engine's one answer (`classificationOf`), read through the label element like the {Classification} placeholder.
  if (field === 'classification' || field === 'classificationTitle') return el.classification?.()?.[field === 'classification' ? 'code' : 'title'] || '?';
  const kind = tagKindOf(el.className());
  const read = (f: TagFieldId): string => String(firstValue(tagToolSourcesOf(el.tagFields, kind, f), (ref) => readStored(ref, el)).value ?? '');
  const name = read('name');
  if (field === 'name') return name || '?';
  return read('mark') || name || '?';
}
