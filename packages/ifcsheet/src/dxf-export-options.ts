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

const EXTERNAL_NAME = /(^|[^a-zäöüß])(ext|extern|external|exterior|aussen|au(ss|ß)en\w*)([^a-zäöüß]|$)/i;
const INTERNAL_NAME = /(^|[^a-zäöüß])(int|intern|internal|interior|innen\w*)([^a-zäöüß]|$)/i;

/**
 * Whether an element is external: its `IsExternal` property (`Pset_*Common`) when a set has one, else what its name says (`Wand-Ext-ERDG-1`,
 * `Wall Internal`: a model that does not fill the property often still names its walls so); undefined when neither says.
 */
export function isExternalOf(properties: Record<string, Record<string, unknown>> | undefined, name?: string): boolean | undefined {
  for (const set of Object.values(properties ?? {})) {
    const v = set?.IsExternal;
    if (v === true || v === 'true' || v === 'TRUE' || v === 'T') return true;
    if (v === false || v === 'false' || v === 'FALSE' || v === 'F') return false;
  }
  if (!name) return undefined;
  if (EXTERNAL_NAME.test(name)) return true;
  return INTERNAL_NAME.test(name) ? false : undefined;
}

/**
 * Where a viewport's drawing is on the sheet: `x`,`y` are the paper position of the drawing's origin, `s` paper millimetres per drawing
 * metre, `kx`,`ky` the signs of the cut (`paperSigns`). The inverse of the drawing-to-paper map: `modelPoint`.
 */
export interface ModelFrame { x: number; y: number; s: number; kx: 1 | -1; ky: 1 | -1 }

/** On a sheet pen, with the DXF options (`DxfSheetOptions`): the class and `IsExternal` of what the pen draws, and where its viewport's drawing is on the paper. */
export interface DxfPenTags { ifcType?: string; external?: boolean; frame?: ModelFrame }

/** A paper point (millimetres, y down as drawn) in its viewport's drawing coordinates, metres. */
export function modelPoint(frame: ModelFrame, p: Point2D): Point2D {
  return { x: (p.x - frame.x) / (frame.kx * frame.s), y: (p.y - frame.y) / (frame.ky * frame.s) };
}

/** `$INSUNITS` of a DXF: 4 millimetres (paper), 6 metres (model). */
export const insunitsOf = (units: DxfUnits): number => (units === 'model' ? 6 : 4);

/** What a sheet is drawn with for a DXF (`sheetGraphic`'s last argument): pens split by element (`byElement`), viewports' frames kept (`modelFrames`), and the names the external-or-not rule reads. */
export interface DxfSheetOptions { byElement?: boolean; modelFrames?: boolean; nameOf?: (entityId: number) => string | undefined }

/** A pen's line, as far as the element layer standard reads it. */
interface Subjected { ifcType?: string; entityId?: number }

/** How the pens of a viewport are split and tagged by element: `split` (for `penGroups`; absent unless by element) and `tags` (the class and `IsExternal` of a pen's first line). */
export function elementPens(dxf: DxfSheetOptions, propertiesOf: ((id: number) => Record<string, Record<string, unknown>> | undefined) | undefined) {
  const externalOf = (id: number | undefined) => (id === undefined ? undefined : isExternalOf(propertiesOf?.(id), dxf.nameOf?.(id)));
  return {
    split: dxf.byElement ? (l: Subjected) => `|${l.ifcType ?? ''}|${externalOf(l.entityId) ?? ''}` : undefined,
    tags: (who: Subjected | undefined): { ifcType?: string; external?: boolean } => {
      if (!dxf.byElement || !who) return {};
      const external = externalOf(who.entityId);
      return { ...(who.ifcType ? { ifcType: who.ifcType } : {}), ...(external !== undefined ? { external } : {}) };
    },
  };
}
