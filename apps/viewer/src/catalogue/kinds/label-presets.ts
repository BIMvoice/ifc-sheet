/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The label presets (#828) as a library kind: a preset and its groups travel in a `.bvlib` next to the annotation types its groups name,
 * so the next project imports both and chooses the preset in LABELALL.
 */
import { readLabelPresets, type LabelPreset } from '@bimvoice/ifcsheet';
import { mergeLabelPresets } from '../label-presets-merge';
import { fail } from '../readers';
import { defineCatalogueKind } from '../registered-kinds';

declare module '../registered-kinds' {
  interface RegisteredCatalogueData { labelPresets: LabelPreset[] }
}

export const registeredCatalogueKinds = [
  defineCatalogueKind({
    key: 'labelPresets',
    empty: () => [],
    read: (file, what) => {
      const raw = file.labelPresets;
      if (raw === undefined) return [];
      if (!Array.isArray(raw)) fail('/labelPresets', 'must be an array', what);
      const list = readLabelPresets(raw);
      if (list.length !== raw.length) fail('/labelPresets', 'must hold label presets { id, name, groups: [{ labelType, filters }] }, each group with at least one condition', what);
      return list;
    },
    merge: mergeLabelPresets,
    fromProject: (s) => s.labelPresets ?? [],
    applyToProject: (s, items) => (items !== (s.labelPresets ?? []) ? { labelPresets: items.length ? items : undefined } : undefined),
  }),
];
