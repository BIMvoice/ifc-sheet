/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What an element tag (the TAG tool) shows: the element's mark, name or IFC
 * class. The mark and the name are read through the same sources as the labels
 * (`tag-fields.ts`), so a tag and a label of one element always agree; the mark
 * falls back to the name. Edits show, as in the lists the labels read.
 */

import { labelElementByGlobalId } from '@/labels/label-element';
import { readField } from '@/labels/label-resolve';
import { elementClassLabel } from '@/project/element-label';

export type TagField = 'mark' | 'name' | 'class';

export const TAG_FIELDS: readonly TagField[] = ['mark', 'name', 'class'];

const MARK = { kind: 'attribute', name: 'Mark' } as const;
const NAME = { kind: 'attribute', name: 'TagName' } as const;

/** The text of an element tag, or null when the element is no longer in the model. */
export function elementLabel(globalId: string, field: TagField): string | null {
  if (field === 'class') return elementClassLabel(globalId);
  const el = labelElementByGlobalId(globalId);
  if (!el) return null;
  const name = String(readField(NAME, el) ?? '');
  if (field === 'name') return name || '?';
  return String(readField(MARK, el) ?? '') || name || '?';
}
