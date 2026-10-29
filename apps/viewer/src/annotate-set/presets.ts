/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project's annotation presets (#497): saving, replacing and deleting them. The record and its reader are in `preset-file.ts`. */

import { useProjectStore } from '@/project/project-store';
import type { AnnotationOptions, AnnotationPreset } from './preset-file';

export { effectiveOptions, readAnnotationPresets, type AnnotationOptions, type AnnotationPreset } from './preset-file';

export const presetsOfProject = (): readonly AnnotationPreset[] => useProjectStore.getState().annotationPresets ?? [];

/** Save `options` under `name`; a preset of that name (any case) is replaced, so a name is one preset. Returns it, or null for a blank name. */
export function saveAnnotationPreset(name: string, options: AnnotationOptions): AnnotationPreset | null {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  const have = presetsOfProject();
  const same = have.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const preset: AnnotationPreset = { id: same?.id ?? crypto.randomUUID(), name: trimmed, on: { ...options.on }, tagParts: { ...options.tagParts } };
  useProjectStore.setState({ annotationPresets: same ? have.map((p) => (p === same ? preset : p)) : [...have, preset], dirty: true });
  return preset;
}

export function deleteAnnotationPreset(id: string): void {
  const have = presetsOfProject();
  if (!have.some((p) => p.id === id)) return;
  const left = have.filter((p) => p.id !== id);
  useProjectStore.setState({ annotationPresets: left.length ? left : undefined, dirty: true });
}
