/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's building materials (`ProjectMaterial`, #90): how each IfcMaterial draws where a view cuts it, its
 * hatch, fill and hatch pen, or a heavy dashed line for a membrane. Matched by name, case- and space-insensitively.
 * A material with no row of its own still draws: its name suggests the hatch (concrete, brick, insulation, timber,
 * steel...) and whether it is a membrane (vapour barrier, foil, damp-proof course...).
 *
 * One copy, for the web app (`project/materials.ts` re-exports it) and for the command line (`ifcsheet materials`),
 * so the table an app saves and the table the engine reads cannot mean two things: the guess, the reader of a saved
 * row and the resolution of a name to its graphics are all here.
 */

import { iterateEffectiveEntityIds, type MutablePropertyView } from '@ifc-lite/mutations';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { CategoryLineWeight } from './view-graphics-types.js';

/**
 * How a building material draws where a view cuts it (ArchiCAD's Building Materials): matched by IfcMaterial name.
 * `hatch` null draws no hatch, absent takes the default its name suggests; a membrane (or any layer under 2 mm)
 * draws as a heavy dashed line instead of a band.
 */
export interface ProjectMaterial {
  id: string;
  name: string;
  hatch?: string | null;
  /** 1 = the pattern's own size. */
  hatchScale?: number;
  /** Cut fill colour; null: none (white), absent: the material's IFC colour. */
  fill?: string | null;
  /** Pen of the hatch lines. */
  hatchPen?: CategoryLineWeight;
  membrane?: boolean;
}

/** The part of a material the guess fills in: everything but its identity. */
export type MaterialSettings = Omit<ProjectMaterial, 'id' | 'name'>;

/** A material's graphics for a name, and whether they are the guess (`auto`) or the project's own row. */
export type MaterialGraphics = ProjectMaterial & { auto: boolean };

/** Layers thinner than this are not cut into bands (the geometry engine merges them): they draw as membranes. */
export const MEMBRANE_THICKNESS_M = 0.002;

const WEIGHTS: ReadonlySet<string> = new Set(['heavy', 'medium', 'light', 'hairline']);
const HEX = /^#[0-9a-f]{6}$/i;

export const normaliseMaterialName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

const GUESSES: readonly [RegExp, Partial<ProjectMaterial>][] = [
  [/vapou?r|barrier|membrane|foil|\bdpc\b|damp|bitum|sheet|folie|barier/, { membrane: true, hatch: null }],
  [/insul|wool|eps\b|xps\b|polystyren|pir\b|pur\b|vata|izola/, { hatch: 'INSULATION', fill: null }],
  [/brick|masonry|block|caramid|zidari|bca|aac/, { hatch: 'BRICK' }],
  [/concrete|beton|screed|sapa|c\d\d\//, { hatch: 'CONCRETE' }],
  [/timber|wood|clt|osb|plywood|lemn/, { hatch: 'WOOD' }],
  [/steel|metal|otel|alumin/, { hatch: 'STEEL' }],
  [/gravel|ballast|pietris|aggregate/, { hatch: 'GRAVEL' }],
  [/earth|soil|pamant|ground/, { hatch: 'EARTH' }],
  [/tile|ceramic|gresie|faianta/, { hatch: 'TILES' }],
  [/plaster|render|gypsum|tencuial|gips|finish|paint/, { hatch: null }],
];

/** The defaults a material name suggests. */
export function guessMaterial(name: string): MaterialSettings {
  const n = normaliseMaterialName(name);
  for (const [re, g] of GUESSES) if (re.test(n)) return { hatchScale: 1, ...g };
  return { hatch: null, hatchScale: 1 };
}

/** The material graphics for a name: its row in `list`, else what its name suggests (`auto`). */
export function materialGraphics(name: string, list: readonly ProjectMaterial[]): MaterialGraphics {
  const key = normaliseMaterialName(name);
  const own = list.find((m) => normaliseMaterialName(m.name) === key);
  return own ? { ...own, auto: false } : { id: `auto:${key}`, name, ...guessMaterial(name), auto: true };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A saved material row read back: `[row]`, or `[]` for what is not one. A field that is not valid is left off, so the guess fills it. */
export function readMaterial(raw: unknown): ProjectMaterial[] {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !raw.name.trim()) return [];
  const out: ProjectMaterial = { id: raw.id, name: raw.name };
  if (raw.hatch === null || typeof raw.hatch === 'string') out.hatch = raw.hatch;
  if (typeof raw.hatchScale === 'number' && Number.isFinite(raw.hatchScale) && raw.hatchScale > 0) out.hatchScale = raw.hatchScale;
  if (raw.fill === null || (typeof raw.fill === 'string' && HEX.test(raw.fill))) out.fill = raw.fill;
  if (typeof raw.hatchPen === 'string' && WEIGHTS.has(raw.hatchPen)) out.hatchPen = raw.hatchPen as CategoryLineWeight;
  if (raw.membrane === true) out.membrane = true;
  return [out];
}

/** The material rows of a project file's `materials` list (anything else is no rows). */
export function readMaterials(raw: unknown): ProjectMaterial[] {
  return Array.isArray(raw) ? raw.flatMap((row) => readMaterial(row)) : [];
}

/** An IfcMaterial's Name (its first attribute), from the overlay or the parsed file. */
export function ifcMaterialName(store: IfcDataStore, view: MutablePropertyView | null | undefined, id: number): string | null {
  if (view?.isDeleted(id)) return null;
  const own = view?.getPositionalMutationsForEntity(id)?.get(0);
  const raw = own ?? (view?.getNewEntity(id) ?? store.getEntity(id))?.attributes[0];
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

/** The distinct IfcMaterial names of one model (case- and space-insensitively), by normalised name. */
export function materialNamesOfStore(store: IfcDataStore, view: MutablePropertyView | null = null, into = new Map<string, string>()): Map<string, string> {
  for (const { expressId } of iterateEffectiveEntityIds(store, view, ['IFCMATERIAL'])) {
    const name = ifcMaterialName(store, view, expressId);
    if (name && name.trim()) into.set(normaliseMaterialName(name), name.trim());
  }
  return into;
}

/** The names in `names` plus the table's own rows, sorted: every material the project can draw. A row of a model's material is listed under the model's spelling. */
export function sortedMaterialNames(names: ReadonlyMap<string, string>, table: readonly ProjectMaterial[]): string[] {
  const all = new Map(names);
  for (const m of table) if (!all.has(normaliseMaterialName(m.name))) all.set(normaliseMaterialName(m.name), m.name);
  return [...all.values()].sort((a, b) => a.localeCompare(b));
}

/** What a material draws with, every default filled in: the values a cut band is hatched and filled by (`materialDrawing` in the app reads the same). */
export interface ResolvedMaterial {
  name: string;
  /** Whether the project has no row for it: the graphics are what its name suggests. */
  auto: boolean;
  /** The hatch pattern, or null for none. */
  hatch: string | null;
  hatchScale: number;
  /** A colour (`#rrggbb`), `'none'` (white behind the hatch) or `'ifc'` (the fill the drawing already has). */
  fill: string;
  hatchPen: CategoryLineWeight;
  membrane: boolean;
}

/** `graphics` with its defaults filled in. */
export function resolvedMaterial(graphics: MaterialGraphics): ResolvedMaterial {
  return {
    name: graphics.name,
    auto: graphics.auto,
    hatch: graphics.hatch ?? null,
    hatchScale: graphics.hatchScale ?? 1,
    fill: graphics.fill === undefined ? 'ifc' : graphics.fill === null ? 'none' : graphics.fill,
    hatchPen: graphics.hatchPen ?? 'hairline',
    membrane: graphics.membrane === true,
  };
}
