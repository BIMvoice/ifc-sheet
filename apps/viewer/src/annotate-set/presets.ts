/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project's annotation presets (#497): saving, replacing and deleting them. The record and its reader are in `preset-file.ts`. */

import { useProjectStore } from '@/project/project-store';
import { withPreset, withoutPreset, type AnnotationOptions, type AnnotationPreset } from '@bimvoice/ifcsheet';

export { effectiveOptions, readAnnotationPresets, type AnnotationOptions, type AnnotationPreset } from '@bimvoice/ifcsheet';

export const presetsOfProject = (): readonly AnnotationPreset[] => useProjectStore.getState().annotationPresets ?? [];

/** Save `options` under `name`; a preset of that name (any case) is replaced, so a name is one preset. Returns it, or null for a blank name. */
export function saveAnnotationPreset(name: string, options: AnnotationOptions): AnnotationPreset | null {
  const { presets, saved } = withPreset(presetsOfProject(), name, options, () => crypto.randomUUID());
  if (saved) useProjectStore.setState({ annotationPresets: [...presets], dirty: true });
  return saved;
}

export function deleteAnnotationPreset(id: string): void {
  const have = presetsOfProject();
  const left = withoutPreset(have, id);
  if (left === have) return;
  useProjectStore.setState({ annotationPresets: left.length ? [...left] : undefined, dirty: true });
}
