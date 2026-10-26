/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet materials` (#90): the materials of a model and how each draws where a view cuts it, with the project's own
 * table applied (`--project`). The names are the model's IfcMaterials, the graphics `materialGraphics` of the project's
 * rows: the same functions the web app's Materials section and its sheets use.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import { materialGraphics, materialNamesOfStore, readMaterials, resolvedMaterial, sortedMaterialNames, type ProjectMaterial, type ResolvedMaterial } from './materials.js';
import { readProjectFile } from './project-read.js';

/** The material rows of a saved project's text. Throws what `readProjectFile` throws when it is not a project file or is newer than this build reads. */
export function readProjectMaterials(text: string): ProjectMaterial[] {
  readProjectFile(text);
  return readMaterials((JSON.parse(text) as { materials?: unknown }).materials);
}

/** Every material of the model (and of the project's table) with what it draws with, sorted by name. */
export function materialReport(store: IfcDataStore, table: readonly ProjectMaterial[]): ResolvedMaterial[] {
  return sortedMaterialNames(materialNamesOfStore(store), table).map((name) => ({ ...resolvedMaterial(materialGraphics(name, table)), name }));
}

/** The report as plain text, a line per material. */
export function materialReportText(rows: readonly ResolvedMaterial[]): string {
  if (rows.length === 0) return 'No materials in the model.\n';
  const width = Math.max(...rows.map((r) => r.name.length));
  const lines = rows.map((r) => {
    const parts = [
      r.membrane ? 'membrane (heavy dashed line)' : `hatch ${r.hatch ?? 'none'}${r.hatch ? ` x${r.hatchScale}, ${r.hatchPen} pen` : ''}`,
      `fill ${r.fill}`,
      r.auto ? 'guessed from the name' : 'from the project',
    ];
    return `${r.name.padEnd(width)}  ${parts.join('; ')}`;
  });
  return `${lines.join('\n')}\n`;
}
