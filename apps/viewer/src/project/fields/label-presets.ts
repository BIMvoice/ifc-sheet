/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readLabelPresets, type LabelPreset } from '@bimvoice/ifcsheet';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The office's label presets (#828): groups of a label type and the conditions an element must meet to get it, used by LABELALL. Absent: none saved. */
    labelPresets?: LabelPreset[];
  }
}

/** Written only when there is one, so a project that never saved a preset saves exactly as before. */
export const labelPresetsField = optionalField('labelPresets', (raw) => {
  const presets = readLabelPresets(raw.labelPresets);
  return presets.length ? { labelPresets: presets } : {};
});

/** Registered by this file (`./registered.ts`): found there, not listed. */
export const registeredFields = [labelPresetsField] as const;
declare module './registered' {
  interface RegisteredFieldKeys {
    labelPresets: true;
  }
}
