/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan symbol drawn by hand in IfcSheet (#448), kept exactly as an imported DXF block is (`JoinerySpec.planBlock`, strokes in metres in
 * the block's frame), so every plan, sheet, PDF and headless build draws it through `blockPlanStrokes` with no drawing path of its own.
 *
 * What the drafting tools make is turned into strokes by the one converter the schedule's drawn views use (`joineryViewDraftPrims`): lines,
 * polylines, circles and arcs; arcs and circles flattened. A closed polyline or a circle is a closed stroke, which a plan draws at the cut
 * weight (as a closed block polyline); everything else is an outline, dashed when it was drawn on a dashed layer. Text and hatches have no
 * place in a block and are left out. The block is named with the empty string: a drawn symbol has no DXF block name.
 */

import type { JoineryBlockPath, JoineryBlockSymbol, JoineryDraftShape, JoineryViewDraft, JoinerySpec } from '@ifc-lite/create';
import { joineryViewDraftPrims } from './joinery-view-drafts.js';
import { MAX_BLOCK_PATHS, MAX_BLOCK_POINTS } from './joinery-block-symbol.js';

/** The name of a block that was drawn, not imported. */
export const DRAWN_SYMBOL_NAME = '';

const STROKES = new Set(['line', 'polyline', 'circle', 'arc']);

/** Whether a block was drawn in IfcSheet rather than imported from a DXF. */
export const isDrawnSymbol = (block: Pick<JoineryBlockSymbol, 'name'> | null | undefined): boolean => block?.name === DRAWN_SYMBOL_NAME;

/** The block the drafts make, or null when they hold no stroke (text and hatches do not count). Strokes past the block caps are left out. */
export function blockFromDrafts(drafts: readonly JoineryViewDraft[]): JoineryBlockSymbol | null {
  const paths: JoineryBlockPath[] = [];
  let points = 0;
  for (const prim of joineryViewDraftPrims(drafts.filter((d) => STROKES.has(d.shape.type)), 1)) {
    if (prim.kind !== 'path' || prim.pts.length < 2) continue;
    if (paths.length >= MAX_BLOCK_PATHS || points + prim.pts.length > MAX_BLOCK_POINTS) break;
    points += prim.pts.length;
    paths.push({ pts: prim.pts.map((p): [number, number] => [p.x, p.y]), ...(prim.closed ? { closed: true as const } : {}), ...(prim.dashed ? { dashed: true as const } : {}) });
  }
  return paths.length ? { name: DRAWN_SYMBOL_NAME, paths } : null;
}

/** A block as shapes the drafting tools can edit: one polyline per stroke (an imported block and a drawn one open the same way). */
export function blockAsShapes(block: JoineryBlockSymbol): Array<{ shape: JoineryDraftShape; dashed: boolean }> {
  return block.paths.map((p) => ({
    shape: { type: 'polyline', pts: p.pts.map(([x, y]) => ({ x, y })), closed: p.closed === true && p.pts.length > 2 },
    dashed: p.dashed === true,
  }));
}

export interface SymbolCanvas {
  /** The opening's footprint in the block's frame: x along the opening, y across the wall, both centred on the frame's centre line. */
  opening: { min: { x: number; y: number }; max: { x: number; y: number } };
  /** What the drawing canvas shows: the footprint with room around it, and for a door the room its swing needs on both sides. */
  view: { min: { x: number; y: number }; max: { x: number; y: number } };
}

/**
 * The canvas a type's symbol is drawn on, sized to the opening: its width and the frame depth. The block is fitted to the opening when
 * drawn (`blockPlanStrokes`), so what matters is the shape against this footprint.
 */
export function symbolCanvas(spec: Pick<JoinerySpec, 'kind' | 'width' | 'frame'>): SymbolCanvas {
  const w = spec.width, d = spec.frame.depth;
  const pad = Math.max(0.05, w * 0.1);
  const reach = spec.kind === 'door' ? w : Math.max(d, w * 0.25);
  return {
    opening: { min: { x: -w / 2, y: -d / 2 }, max: { x: w / 2, y: d / 2 } },
    view: { min: { x: -w / 2 - pad, y: -reach - pad }, max: { x: w / 2 + pad, y: reach + pad } },
  };
}
