/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a material's Fill does to the faces of elevations and sections (#633). The app (`view-surface-fills.ts`,
 * `material-drawing.ts`) and the headless sheets (`set-sheets.ts`) both ask this file, so the screen, the PDF and the command line
 * cannot disagree on a colour.
 *
 * A material's stored fill is `'ifc'` (the colour the model gives it), a `#rrggbb`, `null` (none: paper white) or absent (never set).
 * A project that sets none of them draws exactly as before. As soon as one material is set to a colour, an elevation or section
 * paints every visible face (painter's order, `surface-fills.ts`): the colour of the material where it asks for one, white elsewhere,
 * so a nearer white face still hides a farther coloured one.
 */

import type { SectionConfig } from '@ifc-lite/drawing-2d';
import { extractMaterialsOnDemand, type IfcDataStore } from '@ifc-lite/parser';
import type { MeshData } from '@ifc-lite/geometry';
import { IFC_FILL, materialGraphics, type ProjectMaterial } from './materials.js';
import { surfaceColourOf, surfaceFills, type SurfaceFill } from './surface-fills.js';

const PAPER = '#ffffff';

/** Whether the table asks for a colour anywhere (`'ifc'` or a colour of its own). */
export const materialsColour = (table: readonly ProjectMaterial[]): boolean => table.some((m) => m.fill === IFC_FILL || typeof m.fill === 'string');

/**
 * The cut fill a material gives a band whose mesh colour is `color`: its stored fill with `'ifc'` turned into that colour.
 * `undefined` when there is nothing to say (never set, or `'ifc'` on a band with no colour).
 */
export function cutFillOf(fill: string | null | undefined, color?: readonly number[]): string | null | undefined {
  if (fill !== IFC_FILL) return fill;
  return (color && surfaceColourOf(color)) || undefined;
}

const soleNames = new WeakMap<object, Map<number, string | null>>();

/**
 * The IfcMaterial name of an element made of ONE material (the material associated with it or its type; a layer set or constituent set
 * whose members are all the same material), `null` when it has none or several. Read once per element.
 */
export function soleMaterialName(store: IfcDataStore, entityId: number): string | null {
  let byEntity = soleNames.get(store);
  if (!byEntity) soleNames.set(store, (byEntity = new Map()));
  const known = byEntity.get(entityId);
  if (known !== undefined) return known;
  const info = extractMaterialsOnDemand(store, entityId);
  const names = new Set<string>();
  if (info) {
    if (info.type === 'Material' && info.name) names.add(info.name);
    for (const l of info.layers ?? []) names.add(l.materialName ?? '');
    for (const c of info.constituents ?? []) names.add(c.materialName ?? '');
    for (const m of info.materials ?? []) names.add(m.name);
  }
  const only = names.size === 1 ? [...names][0] : null;
  const name = only && only.trim() ? only : null;
  byEntity.set(entityId, name);
  return name;
}

/**
 * The IfcMaterial a mesh is painted by: the layer it slices (`materialId`, the name of that IfcMaterial), else its element's one material.
 * The app and the headless sheets both name a mesh's material with this.
 */
export function meshMaterialName(store: IfcDataStore, entityId: number, materialId?: number): string | null {
  if (materialId === undefined) return soleMaterialName(store, entityId);
  const raw = store.getEntity(materialId)?.attributes?.[0];
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

export interface ViewSurfaceInputs {
  /** The view's own switch for coloured surfaces (#499): faces of materials with no say take the mesh colour. */
  switch: boolean;
  /** The project's materials table. */
  table: readonly ProjectMaterial[];
  /** The IfcMaterial name of a mesh (its layer, else its element's one material); null when it has none. */
  materialNameOf(mesh: MeshData): string | null;
  /** What the view hides. */
  shown?: (entityId: number, ifcType: string | undefined) => boolean;
}

/** The painted faces of an elevation or section: none when neither the view's switch nor a material asks for a colour. */
export function viewSurfaceFills(meshes: readonly MeshData[], config: SectionConfig, inputs: ViewSurfaceInputs): SurfaceFill[] {
  const byMaterial = materialsColour(inputs.table);
  if (!inputs.switch && !byMaterial) return [];
  const colourOf = (mesh: MeshData): string | null => {
    const name = inputs.materialNameOf(mesh);
    const row = name ? materialGraphics(name, inputs.table) : null;
    const fill = row && !row.auto ? row.fill : undefined;
    if (fill === IFC_FILL) return surfaceColourOf(mesh.color);
    if (typeof fill === 'string') return fill.toLowerCase();
    if (fill === null) return PAPER;
    return inputs.switch ? surfaceColourOf(mesh.color) : PAPER;
  };
  return surfaceFills(meshes, config, inputs.shown, colourOf);
}
