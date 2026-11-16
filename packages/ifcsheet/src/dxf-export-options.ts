/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a DXF is written for (#831): a print (the default, today's file: layers by pen, paper millimetres) or a CAD working file, with two
 * independent choices.
 * - Layers: `pen` (CUT, SEEN, HIDDEN...) or `element` (AIA-style names from the IFC class: A-WALL-EXTR, A-WALL-INTR, A-DOOR, A-GLAZ...,
 *   and A-ANNO-DIMS for dimensions). The element names are an ordinary CAD layer standard (`elementLayerRules`), so a project's own rules, when it
 *   has any, still win over them.
 * - Units: `paper` (millimetres on the sheet) or `model` (each viewport's drawing at its true size, in metres, at its model coordinates; the
 *   sheet's frame, title block and notes are left out, they are not the building).
 * One module for the app's DXF button and `ifcsheet build --dxf`.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { CadLayerRule } from './cad-layers.js';

export type DxfLayerScheme = 'pen' | 'element';
export type DxfUnits = 'paper' | 'model';

export interface DxfExportOptions {
  layers: DxfLayerScheme;
  units: DxfUnits;
}

export const DEFAULT_DXF_EXPORT: DxfExportOptions = { layers: 'pen', units: 'paper' };

export const DXF_LAYER_SCHEMES: readonly DxfLayerScheme[] = ['pen', 'element'];
export const DXF_UNITS: readonly DxfUnits[] = ['paper', 'model'];

/** IFC class (without the type-predefined suffix) to its AIA-style layer; walls are split by `IsExternal` first. */
const ELEMENT_LAYERS: readonly [string, string[]][] = [
  ['A-DOOR', ['IfcDoor']],
  ['A-GLAZ', ['IfcWindow']],
  ['A-GLAZ-CURT', ['IfcCurtainWall']],
  ['A-FLOR-STRS', ['IfcStair', 'IfcStairFlight']],
  ['A-FLOR-HRAL', ['IfcRailing']],
  ['A-FLOR', ['IfcSlab']],
  ['A-ROOF', ['IfcRoof']],
  ['A-COLS', ['IfcColumn']],
  ['A-BEAM', ['IfcBeam', 'IfcMember']],
  ['A-FLOR-FNSH', ['IfcCovering']],
  ['A-FURN', ['IfcFurnishingElement', 'IfcFurniture']],
  ['A-AREA', ['IfcSpace']],
];

const WALLS = ['IfcWall', 'IfcWallStandardCase'];

/** The element layer standard: a table of CAD layer rules (`cad-layers.ts`), the first match winning. A new array on every call. */
export function elementLayerRules(): CadLayerRule[] {
  const rule = (id: string, layer: string, more: Partial<CadLayerRule>): CadLayerRule => ({ id: `aia-${id}`, layer, ...more });
  return [
    rule('wall-extr', 'A-WALL-EXTR', { ifcClasses: WALLS, external: true }),
    rule('wall-intr', 'A-WALL-INTR', { ifcClasses: WALLS, external: false }),
    rule('wall', 'A-WALL', { ifcClasses: WALLS }),
    ...ELEMENT_LAYERS.map(([layer, classes]) => rule(layer.toLowerCase(), layer, { ifcClasses: classes })),
    // What the plan draws for an opening that no class names (its swing symbols), and the drafted annotations.
    rule('symbols', 'A-DOOR-SYMB', { source: 'SYMBOLS' }),
    rule('dims', 'A-ANNO-DIMS', { kind: 'dimension' }),
    rule('text', 'A-ANNO-TEXT', { kind: 'text' }),
    rule('patt', 'A-ANNO-PATT', { kind: 'hatch' }),
  ];
}

/** The CAD layer standard a DXF is written through: the project's own when it has rules, else the element standard when asked for, else none. */
export function dxfCadRules(project: readonly CadLayerRule[] | undefined, layers: DxfLayerScheme): readonly CadLayerRule[] {
  if (project?.length) return project;
  return layers === 'element' ? elementLayerRules() : [];
}

/** Whether an element is external, from its property sets (`Pset_*Common.IsExternal`); undefined when no set says. */
export function isExternalOf(properties: Record<string, Record<string, unknown>> | undefined): boolean | undefined {
  if (!properties) return undefined;
  for (const set of Object.values(properties)) {
    const v = set?.IsExternal;
    if (v === true || v === 'true' || v === 'TRUE' || v === 'T') return true;
    if (v === false || v === 'false' || v === 'FALSE' || v === 'F') return false;
  }
  return undefined;
}

/**
 * Where a viewport's drawing is on the sheet: `x`,`y` are the paper position of the drawing's origin, `s` paper millimetres per drawing
 * metre, `kx`,`ky` the signs of the cut (`paperSigns`). The inverse of the drawing-to-paper map: `modelPoint`.
 */
export interface ModelFrame { x: number; y: number; s: number; kx: 1 | -1; ky: 1 | -1 }

/** A paper point (millimetres, y down as drawn) in its viewport's drawing coordinates, metres. */
export function modelPoint(frame: ModelFrame, p: Point2D): Point2D {
  return { x: (p.x - frame.x) / (frame.kx * frame.s), y: (p.y - frame.y) / (frame.ky * frame.s) };
}

/** `$INSUNITS` of a DXF: 4 millimetres (paper), 6 metres (model). */
export const insunitsOf = (units: DxfUnits): number => (units === 'model' ? 6 : 4);
