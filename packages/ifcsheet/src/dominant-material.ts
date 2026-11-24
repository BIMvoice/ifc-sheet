/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which IfcMaterial an element cut in ONE piece is drawn by. A wall of several layers is cut into one outline at coarse detail
 * (`atDetailLevel`, the default at 1:100), so its cut has no layer to take a hatch from. It takes the hatch of its dominant material:
 *
 * - an IfcMaterialLayerSet: the layer with the greatest LayerThickness;
 * - an IfcMaterialConstituentSet: the constituent with the greatest Fraction when fractions are given, else the first;
 * - an IfcMaterialList: the first material.
 *
 * Ties go to the first in file order. A ventilated layer (IsVentilated) and a layer, constituent or member with no material are never
 * dominant. An element of one material (all its layers or constituents the same IfcMaterial) is named by that material, as before.
 *
 * The app (`apps/viewer/src/project/material-resolver.ts`, which reads the layers through its edit overlay) and the headless sheets
 * (`headlessMaterialSource`) both describe the element's material definition as a `MaterialMakeup` and ask this file, so a plan cannot
 * hatch a wall one way on screen and another in the PDF.
 */

/** A layer of an IfcMaterialLayerSet, in file order: its IfcMaterial's Name (null: no material), LayerThickness (metres) and IsVentilated. */
export interface MakeupLayer { name: string | null; thickness?: number; ventilated?: boolean }
/** A constituent of an IfcMaterialConstituentSet, in file order: its IfcMaterial's Name (null: none) and Fraction. */
export interface MakeupConstituent { name: string | null; fraction?: number }

/** An element's material definition, as far as naming its cut needs it. */
export type MaterialMakeup =
  | { kind: 'material'; name: string | null }
  | { kind: 'layers'; layers: readonly MakeupLayer[] }
  | { kind: 'constituents'; constituents: readonly MakeupConstituent[] }
  | { kind: 'list'; names: readonly (string | null)[] };

/** How an element cut in one piece is named: not at all, only when it is of one material, or by its dominant material when of several. */
export type PieceNaming = 'none' | 'sole' | 'dominant';

const named = (name: string | null | undefined): name is string => typeof name === 'string' && name.trim() !== '';

/** Every IfcMaterial name the makeup holds, a member with no material as `''`. */
function namesOf(m: MaterialMakeup): string[] {
  switch (m.kind) {
    case 'material': return [m.name ?? ''];
    case 'layers': return m.layers.map((l) => l.name ?? '');
    case 'constituents': return m.constituents.map((c) => c.name ?? '');
    case 'list': return m.names.map((n) => n ?? '');
  }
}

/** The one IfcMaterial the element is made of (every member the same material), else null. */
export function soleMaterialOf(m: MaterialMakeup): string | null {
  const names = new Set(namesOf(m));
  const only = names.size === 1 ? [...names][0] : null;
  return named(only) ? only : null;
}

/** The first of `items` with the greatest `measure` (a missing or non-finite one counts as 0), or null when `items` is empty. */
function greatest<T>(items: readonly T[], measure: (item: T) => number | undefined): T | null {
  let best: T | null = null, most = -Infinity;
  for (const item of items) {
    const raw = measure(item);
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    if (value > most) { best = item; most = value; }
  }
  return best;
}

/** The dominant IfcMaterial of an element of several materials (see the head of this file), or null when no member qualifies. */
export function dominantMaterialOf(m: MaterialMakeup): string | null {
  switch (m.kind) {
    case 'material': return named(m.name) ? m.name : null;
    case 'layers': return greatest(m.layers.filter((l) => named(l.name) && !l.ventilated), (l) => l.thickness)?.name ?? null;
    case 'constituents': {
      const candidates = m.constituents.filter((c) => named(c.name));
      const fractions = candidates.some((c) => typeof c.fraction === 'number' && Number.isFinite(c.fraction));
      return (fractions ? greatest(candidates, (c) => c.fraction) : candidates[0] ?? null)?.name ?? null;
    }
    case 'list': return m.names.find(named) ?? null;
  }
}

/** The IfcMaterial an element cut in one piece is drawn by, for `naming` (`PieceNaming`). */
export function pieceMaterialOf(m: MaterialMakeup | null, naming: PieceNaming): string | null {
  if (!m || naming === 'none') return null;
  return soleMaterialOf(m) ?? (naming === 'dominant' ? dominantMaterialOf(m) : null);
}
