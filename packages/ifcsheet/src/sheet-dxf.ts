/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One sheet as DXF R2000, from the sheet layout (`sheet-graphic.ts`) instead of the app's rendered SVG: the same writer (`dxf-r2000.ts`),
 * the same layers for the same things and the same CAD layer standard (`layerAndPens`) as the app's `svgToDxf`, so `ifcsheet build --dxf`
 * and the app's DXF button name a layer alike (#619). The drawing's pens go on CUT / SEEN / HIDDEN / SYMBOLS / HATCH, the frame on FRAME,
 * the title block on TITLEBLOCK, view titles and notes on VIEWPORT-LABELS, the north arrows and scale bars on SITE-SYMBOLS, a colour scheme
 * on COLOUR, its legend on LEGEND.
 *
 * Left out, as in the app: the cut faces' grey fills, a coloured surface (#499), the underlays (a picture). Not written yet: the layer a
 * drafted line or text is on in the app (its drafting layer's name), which a sheet layout does not carry; they go on SHEET.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { CadLayerRule } from './cad-layers.js';
import type { CustomLineType } from './draft-look.js';
import { layerAndPens } from './dxf-cad-layers.js';
import { penTags, type DxfSubject } from './dxf-pen-tags.js';
import { DxfR2000 } from './dxf-r2000.js';
import { FILL_HATCH } from './sheet-colours.js';
import type { Polyline, SheetGraphic } from './sheet-graphic.js';
import { DEFAULT_SHEET_WEIGHTS } from './title-block-standard.js';

/** What the writer reads besides the sheet: the project's CAD layer standard and its own line types; absent: the layers the sheet's roles name. */
export interface SheetDxfOptions {
  cadLayers?: readonly CadLayerRule[];
  lineTypes?: readonly CustomLineType[];
}

const SYMBOL_PEN = 0.25;
const LABEL_PEN = 0.25;
const LEGEND_PEN = 0.18;
/** The app's text height for a font size: an SVG font size spans the line, a DXF text height the capitals. */
const TEXT_HEIGHT = 0.72;

/** A run that ends where it starts is a closed ring: written once round, not as a run with a doubled corner. */
const closes = (run: Polyline): boolean => run.length > 3 && run[0].x === run[run.length - 1].x && run[0].y === run[run.length - 1].y;

/** One sheet as DXF R2000 text (windows-1252 bytes), paper millimetres with y up and the origin at the paper's bottom-left corner. */
export function sheetGraphicToDxf(sheet: SheetGraphic, options: SheetDxfOptions = {}): Uint8Array {
  const cad = options.cadLayers ?? [];
  const writer = new DxfR2000();
  for (const l of options.lineTypes ?? []) writer.defineLineType(l.id, l.name, l.dash);
  const flip = (p: Point2D): Point2D => ({ x: p.x, y: sheet.paper.h - p.y });

  /** The layer and pens a role's thing goes on, resolved through the project's CAD layer standard as the app does (`svgToDxf`). */
  const pen = (role: string, width: number, colour = '#000000', dashed = false, subject: DxfSubject = {}) => {
    const tags = penTags(role, width, dashed, colour, subject);
    const chosen = layerAndPens(cad, (name) => tags[`data-dxf-${name}` as keyof typeof tags], role, colour);
    return { layer: writer.layer(chosen.name, chosen.layer), own: chosen.own };
  };
  const runs = (list: readonly Polyline[], role: string, width: number, colour = '#000000', dashed = false) => {
    const { layer, own } = pen(role, width, colour, dashed);
    for (const run of list) {
      const closed = closes(run);
      writer.polyline((closed ? run.slice(0, -1) : run).map(flip), layer, own, closed);
    }
  };
  const solid = (loops: readonly Polyline[], role: string, width: number, colour: string) => {
    const { layer, own } = pen(role, width, colour);
    writer.hatch(loops.map((l) => (closes(l) ? l.slice(0, -1) : l).map(flip)), layer, own);
  };

  // The frame is the first rectangle, the title block's box and rules follow it.
  runs(sheet.frame.slice(0, 1), 'FRAME', DEFAULT_SHEET_WEIGHTS.frame);
  runs(sheet.frame.slice(1), 'TITLEBLOCK', DEFAULT_SHEET_WEIGHTS.titleDivider);
  for (const fill of sheet.fills.filter((f) => !f.surface)) {
    solid(fill.loops, 'COLOUR', 0, fill.colour);
    if (fill.hatch) runs(fill.hatch.strokes, 'HATCH', fill.hatch.width, FILL_HATCH.ink);
  }
  for (const p of sheet.pens) if (p.stroke !== null && p.runs.length > 0) runs(p.runs, p.layer, p.width, p.stroke, !!p.dash);
  runs(sheet.marks, 'LEGEND', LEGEND_PEN);
  for (const s of sheet.strokes ?? []) {
    if (s.fill) solid(s.runs, 'SHEET', s.width, s.colour);
    else runs(s.runs, 'SHEET', s.width, s.colour, !!s.dash);
  }
  runs(sheet.symbols.strokes, 'SITE-SYMBOLS', SYMBOL_PEN);
  solid(sheet.symbols.solids, 'SITE-SYMBOLS', SYMBOL_PEN, '#000000');
  runs(sheet.symbols.solids, 'SITE-SYMBOLS', SYMBOL_PEN);

  for (const t of sheet.texts) {
    const role = t.layer ?? 'SHEET';
    const { layer, own } = pen(role, role === 'VIEWPORT-LABELS' ? LABEL_PEN : LEGEND_PEN, t.colour ?? '#000000');
    writer.text(flip(t.at), t.text, t.size * TEXT_HEIGHT, layer, { rotationDeg: t.angle ?? 0, align: t.align ?? 'left', pen: own, ...(t.face ? { tablesFace: t.face.font } : {}) });
  }
  return writer.bytes(`units: millimetres (paper), sheet ${sheet.number} ${sheet.name}`);
}

