/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's building materials in the app: the table in the project store, edited as undo steps (#90). What a
 * material is, how its name is guessed and how a saved row is read live in the engine (`@bimvoice/ifcsheet/materials`,
 * re-exported here), so the app and `ifcsheet materials --project` cannot disagree. A material with no row of its own
 * still draws: its name suggests the hatch and whether it is a membrane.
 */

import {
  guessMaterial, materialGraphics as graphicsIn, materialNamesOfStore, normaliseMaterialName, sortedMaterialNames,
  type MaterialGraphics, type MaterialSettings, type ProjectMaterial,
} from '@bimvoice/ifcsheet/materials';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useViewerStore } from '@/store';
import { useProjectStore } from './project-store';
import { freshProjectId } from './view-defaults';

export { MEMBRANE_THICKNESS_M, guessMaterial, ifcMaterialName, normaliseMaterialName } from '@bimvoice/ifcsheet/materials';
export type { MaterialGraphics, MaterialSettings } from '@bimvoice/ifcsheet/materials';

export const projectMaterials = (): ProjectMaterial[] => useProjectStore.getState().materials ?? [];

/** The material graphics for a name: its row, else what its name suggests (`auto`). */
export const materialGraphics = (name: string, list: readonly ProjectMaterial[] = projectMaterials()): MaterialGraphics => graphicsIn(name, list);

/** Write a material's row (creating it from its defaults when it had none). One undo step. */
export function setMaterial(name: string, patch: Partial<MaterialSettings>): void {
  runAsOneUndoStep(() => {
    const list = projectMaterials();
    const key = normaliseMaterialName(name);
    const at = list.findIndex((m) => normaliseMaterialName(m.name) === key);
    const base = at >= 0 ? list[at] : { id: freshProjectId('material'), name: name.trim(), ...guessMaterial(name) };
    const next = { ...base, ...patch };
    useProjectStore.setState({ materials: at >= 0 ? list.map((m, i) => (i === at ? next : m)) : [...list, next], dirty: true });
  });
}

/** Back to what the name suggests: the row goes. One undo step. */
export function resetMaterial(name: string): void {
  const key = normaliseMaterialName(name);
  if (!projectMaterials().some((m) => normaliseMaterialName(m.name) === key)) return;
  runAsOneUndoStep(() => useProjectStore.setState({ materials: projectMaterials().filter((m) => normaliseMaterialName(m.name) !== key), dirty: true }));
}

/** Every material back to its guess: the table goes. One undo step. */
export function resetAllMaterials(): void {
  if (projectMaterials().length === 0) return;
  runAsOneUndoStep(() => useProjectStore.setState({ materials: [], dirty: true }));
}

/** Every IfcMaterial name in the loaded models, plus the table's own rows, sorted. */
export function materialNamesInModels(): string[] {
  const s = useViewerStore.getState();
  const names = new Map<string, string>();
  for (const [modelId, model] of s.models) {
    if (model.ifcDataStore) materialNamesOfStore(model.ifcDataStore, s.mutationViews.get(modelId) ?? null, names);
  }
  return sortedMaterialNames(names, projectMaterials());
}
