/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The properties a view can be coloured by (#92): the attributes every room or element has, and the `Pset.Property` of the
 * rooms or elements the view holds that carry a value. What the card offers; a path can still be typed.
 */

import { valueText } from '@bimvoice/ifcsheet/colour-scheme';
import { labelElementOf } from '@/labels/label-element';
import { useViewerStore } from '@/store';

export const ATTRIBUTE_CHOICES = ['LongName', 'Name', 'ObjectType', 'Description', 'PredefinedType', 'Tag'] as const;

/** At most this many elements are read for the list: the properties of a model are alike across its elements. */
const SAMPLE = 400;

/** The attributes, then the `Pset.Property` paths (sorted) that the elements with these renderer ids carry a value for. */
export function propertyChoices(renderIds: Iterable<number>): string[] {
  const paths = new Set<string>();
  const seen = new Set<number>();
  for (const id of renderIds) {
    if (seen.size >= SAMPLE) break;
    if (seen.has(id)) continue;
    seen.add(id);
    const at = useViewerStore.getState().resolveGlobalIdFromModels(id);
    const el = at ? labelElementOf(at.modelId, at.expressId) : null;
    if (!el) continue;
    for (const set of el.propertySets()) for (const p of set.properties) if (valueText(p.value) !== null) paths.add(`${set.name}.${p.name}`);
  }
  return [...ATTRIBUTE_CHOICES, ...[...paths].sort((a, b) => a.localeCompare(b))];
}
