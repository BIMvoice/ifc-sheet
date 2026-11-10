/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readAnnotationPresets, type AnnotationPreset } from '@/annotate-set/preset-file';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The office's annotation presets (#497): named choices of what TAGALL, DIMALL and LEVELALL place. Absent: none saved. */
    annotationPresets?: AnnotationPreset[];
  }
}

/** Written only when there is one, so a project that never saved a preset saves exactly as before. */
export const annotationPresetsField = optionalField('annotationPresets', (raw) => {
  const presets = readAnnotationPresets(raw.annotationPresets);
  return presets.length ? { annotationPresets: presets } : {};
});
