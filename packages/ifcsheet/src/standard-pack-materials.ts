/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material hatch rules of the standards packs (#365): which hatch pattern each material draws with where a view
 * cuts it, as `ProjectMaterial` rows (#90), the rows the app's Materials section edits and `ifcsheet materials` reads.
 *
 * Sourcing. The hatch lines are drawn at the narrow pen (`hatchPen: 'hairline'`, 0.13 mm), as ISO 128-50 draws hatching
 * in narrow continuous lines. WHICH pattern a material takes is practice: ISO 128-50 gives 45-degree narrow lines as
 * the general hatch and shows example indications for some materials, but no clause of it, of STAS or of DIN 1356-1
 * was checked here. The patterns are the engine's own conventional indications (the ones `guessMaterial` already
 * suggests by name: CONCRETE, BRICK, STEEL, WOOD, INSULATION, EARTH, GRAVEL). They are NOT replaced by the ISO 128-50
 * general hatch (LINES45), which would draw every material alike. All of them are UNVERIFIED against STAS and DIN.
 *
 * What the rows add over the name guess is the language of the names. `guessMaterial` matches Romanian words written
 * without diacritics (`caramid`, `otel`, `pamant`) and no German word but "Beton", so a model that names its materials
 * "Cărămidă", "Oțel", "Pământ", "Pietriș" or "Mauerwerk", "Stahl", "Holz", "Dämmung" draws them with no hatch until
 * the project says otherwise. A row is matched by the name, case- and space-insensitively.
 */

import type { MaterialSettings, ProjectMaterial } from './materials.js';
import { normaliseMaterialName } from './materials.js';

const row = (packId: string, name: string, settings: MaterialSettings): ProjectMaterial => ({
  id: `pack:${packId}:${normaliseMaterialName(name).replace(/ /g, '-')}`,
  name,
  hatchScale: 1,
  hatchPen: 'hairline',
  ...settings,
});

/** "România: STAS / ISO 128": the materials of a Romanian model, by their Romanian names. Patterns unverified against STAS. */
export const ROMANIAN_MATERIALS = (packId: string): ProjectMaterial[] => [
  row(packId, 'Beton armat', { hatch: 'CONCRETE' }),
  row(packId, 'Beton', { hatch: 'CONCRETE' }),
  row(packId, 'Zidărie', { hatch: 'BRICK' }),
  row(packId, 'Cărămidă', { hatch: 'BRICK' }),
  row(packId, 'Oțel', { hatch: 'STEEL' }),
  row(packId, 'Lemn', { hatch: 'WOOD' }),
  row(packId, 'Termoizolație', { hatch: 'INSULATION', fill: null }),
  row(packId, 'Pământ', { hatch: 'EARTH' }),
  row(packId, 'Pietriș', { hatch: 'GRAVEL' }),
];

/** "Deutschland: DIN / ISO 128": the materials of a German model, by their German names. Patterns unverified against DIN 1356-1. */
export const GERMAN_MATERIALS = (packId: string): ProjectMaterial[] => [
  row(packId, 'Stahlbeton', { hatch: 'CONCRETE' }),
  row(packId, 'Beton', { hatch: 'CONCRETE' }),
  row(packId, 'Mauerwerk', { hatch: 'BRICK' }),
  row(packId, 'Ziegel', { hatch: 'BRICK' }),
  row(packId, 'Stahl', { hatch: 'STEEL' }),
  row(packId, 'Holz', { hatch: 'WOOD' }),
  row(packId, 'Dämmung', { hatch: 'INSULATION', fill: null }),
  row(packId, 'Erdreich', { hatch: 'EARTH' }),
  row(packId, 'Kies', { hatch: 'GRAVEL' }),
];

const key = normaliseMaterialName;

/** The project's `table` with the pack's rows over it: a row of the pack replaces the project's row of the same name (keeping its place and id), the project's other rows stay. */
export function withPackMaterials(table: readonly ProjectMaterial[], packRows: readonly ProjectMaterial[]): ProjectMaterial[] {
  const byName = new Map(packRows.map((m) => [key(m.name), m]));
  const used = new Set<string>();
  const out = table.map((m) => {
    const p = byName.get(key(m.name));
    if (!p) return m;
    used.add(key(m.name));
    return { ...p, id: m.id };
  });
  for (const p of packRows) if (!used.has(key(p.name))) out.push(p);
  return out;
}

/** Whether `table` holds every row of the pack: same name, hatch, scale, fill, pen and membrane (the id is the project's own). */
export function hasPackMaterials(table: readonly ProjectMaterial[] | undefined, packRows: readonly ProjectMaterial[]): boolean {
  return packRows.every((p) => {
    const m = (table ?? []).find((x) => key(x.name) === key(p.name));
    return m !== undefined && m.hatch === p.hatch && m.hatchScale === p.hatchScale && m.fill === p.fill && m.hatchPen === p.hatchPen && (m.membrane === true) === (p.membrane === true);
  });
}
