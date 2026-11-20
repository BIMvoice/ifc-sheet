/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project's label presets (#828): saving a preset (a name of any case replaces its namesake) and deleting one. Matching is the engine's (`labels/label-preset.ts`). */

import { presetNamed, readLabelPresets, type LabelPreset, type LabelPresetGroup } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';

export const labelPresetsOfProject = (): readonly LabelPreset[] => useProjectStore.getState().labelPresets ?? [];

/** Save `groups` under `name`. Returns the preset, or null when the name is blank or a group has no condition (a preset that would label everything is not saved). */
export function saveLabelPreset(name: string, groups: readonly LabelPresetGroup[]): LabelPreset | null {
  const have = labelPresetsOfProject();
  const id = presetNamed(have, name)?.id ?? crypto.randomUUID();
  const saved = readLabelPresets([{ id, name: name.trim(), groups }])[0];
  if (!saved || saved.groups.length !== groups.length) return null;
  useProjectStore.setState({ labelPresets: [...have.filter((p) => p.id !== id), saved], dirty: true });
  return saved;
}

export function deleteLabelPreset(id: string): void {
  const have = labelPresetsOfProject();
  const left = have.filter((p) => p.id !== id);
  if (left.length === have.length) return;
  useProjectStore.setState({ labelPresets: left.length ? left : undefined, dirty: true });
}
