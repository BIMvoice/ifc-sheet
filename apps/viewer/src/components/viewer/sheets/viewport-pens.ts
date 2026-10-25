/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A viewport's drawing as paper pens, honouring its view's Visibility /
 * Graphics (`project/view-graphics.ts`): the drawing arrives already styled
 * (hidden categories dropped, parts relabelled, cut fills stamped); here
 * each category's line colour and weight pick the pen, cut fills keep their
 * colour, and category cut hatches are laid out in drawing units. Paths are
 * grouped by pen, so a sheet stays a handful of SVG paths.
 *
 * A linked model's style (`project/model-styles.ts`, #96) comes last: after
 * the category picked a pen, a halftone element's stroke, fill and hatch go
 * lighter, keeping their weights.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { HATCH_UNIT_M } from '@/drafting/annotation';
import { findPattern } from '@/drafting/hatch/library';
import { hatchSegments } from '@/drafting/hatch/fill';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { categoryOf, cutHatches, type StyledDrawing } from '@/project/view-graphics';
import { itemPen } from '@/project/item-pen';
import { fillOrder, schemeColourOf } from '@/project/view-scheme-style';
import { DEFAULT_GRAPHIC_STANDARD, type GraphicStandard } from '@/drafting/graphic-standard';
import type { ViewGraphics } from '@/project/types';
import { halftoneColor, type EntityStyleOf } from '@/project/model-styles';

export interface Pen {
  d: string;
  stroke: string | null;
  /** Paper millimetres. */
  width: number;
  fill: string | null;
  dash?: string;
  /** The DXF layer it exports on. */
  layer: string;
  /** A colour scheme's fill (#92): the DXF carries it as a solid hatch, which a plain cut-face fill is not. */
  solid?: boolean;
  /** With a CAD layer standard: the element class and material the pen is split by (`dxf-tags.ts`). */
  ifcType?: string;
  material?: string;
}

/** The CAD layer standard's view of a drawing: pens are split per element class and material only when it is given. */
export interface CadPenContext {
  /** The IfcMaterial name of an element (or of one of its layers when `materialId` is given), or null. */
  materialOf(entityId: number, materialId?: number): string | null;
}

/** Default pens, paper millimetres (the default graphic standard's; the overlays that do not take a standard yet draw with these). */
export const PEN = DEFAULT_GRAPHIC_STANDARD.pens;
const DEFAULT_FILL = '#d4d4d8';

const hex = (c: readonly number[]) => `#${c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

export function viewportPens(
  drawing: Drawing2D | StyledDrawing, graphics: ViewGraphics | undefined, t: ViewTransform, axis: SectionAxisName, extraPatterns: readonly HatchPattern[], cad?: CadPenContext,
  /** Each entity's model style; absent: every model draws normally. */
  styleOf?: EntityStyleOf,
  standard: GraphicStandard = DEFAULT_GRAPHIC_STANDARD,
): Pen[] {
  const base = standard.pens;
  const pens = new Map<string, Pen>();
  const add = (key: string, base: Omit<Pen, 'd'>, d: string) => {
    const pen = pens.get(key);
    if (pen) pen.d += d;
    else pens.set(key, { ...base, d });
  };
  const pt = (p: { x: number; y: number }) => {
    const s = drawingToScreen(p, t, axis);
    return `${s.x.toFixed(2)} ${s.y.toFixed(2)}`;
  };
  const loop = (pts: readonly { x: number; y: number }[]) => `M${pts.map(pt).join('L')}Z`;
  // Under a CAD layer standard a pen also carries the class and material of what it draws, and is split by them.
  const subject = (ifcType: string | undefined, entityId: number | undefined, materialId?: number): { key: string; tags: Pick<Pen, 'ifcType' | 'material'> } => {
    if (!cad) return { key: '', tags: {} };
    const material = entityId === undefined ? null : cad.materialOf(entityId, materialId);
    return { key: `|${ifcType ?? ''}|${material ?? ''}`, tags: { ...(ifcType ? { ifcType } : {}), ...(material ? { material } : {}) } };
  };
  const style = (ifcType: string | undefined) => {
    const id = ifcType ? categoryOf(ifcType) : null;
    return id ? graphics?.categories?.[id] : undefined;
  };
  const ink = (colour: string, entityId: number | undefined) => (entityId !== undefined && styleOf?.(entityId) === 'halftone' ? halftoneColor(colour) : colour);

  for (const polygon of fillOrder(drawing)) {
    // An element's own graphics (#32) come last, over its phase's, a phase's fill, like its line, after the category's; a colour scheme's (#92) after those.
    const pen = itemPen(graphics, polygon, standard.weights);
    const fill = ink(schemeColourOf(polygon) ?? (pen?.fill ?? (polygon.color && style(polygon.ifcType)?.fillColor ? hex(polygon.color) : DEFAULT_FILL)), polygon.entityId);
    const d = [polygon.polygon.outer, ...polygon.polygon.holes].map(loop).join('');
    if (schemeColourOf(polygon)) add(`scheme:${fill}`, { stroke: null, width: 0, fill, layer: 'COLOUR', solid: true }, d);
    else add(`fill:${fill}`, { stroke: null, width: 0, fill, layer: 'FILL' }, d);
  }
  for (const line of drawing.lines) {
    const g = style(line.ifcType);
    const d = `M${pt(line.line.start)}L${pt(line.line.end)}`;
    const pen = itemPen(graphics, line, standard.weights);
    const color = ink(pen?.color ?? g?.lineColor ?? '#000000', line.entityId);
    const who = subject(line.ifcType, line.entityId);
    if (line.visibility === 'hidden' || line.category === 'hidden') {
      add(`hidden:${color}${who.key}`, { stroke: color, width: base.hidden, fill: null, dash: '1.5 1', layer: 'HIDDEN', ...who.tags }, d);
      continue;
    }
    const cut = line.category === 'cut';
    const weight = pen?.mm ?? (g?.lineWeight ? standard.weights[g.lineWeight][cut ? 'cut' : 'projection'] : cut ? base.cut : line.category === 'silhouette' ? base.outline : base.seen);
    // A dashed pen (a phase's, or an element's) keeps its layer (CUT / SEEN) and gains the dash; the DXF reads the line type from it.
    const dash = pen?.dash?.length ? pen.dash.join(' ') : undefined;
    add(`${cut ? 'cut' : 'seen'}:${color}:${weight}:${dash ?? ''}${who.key}`, { stroke: color, width: weight, fill: null, layer: cut ? 'CUT' : 'SEEN', ...(dash ? { dash } : {}), ...who.tags }, d);
  }
  for (const h of cutHatches(drawing, graphics, standard.materialHatch)) {
    const pattern = findPattern(h.pattern, extraPatterns);
    if (!pattern) continue;
    const color = ink(h.color, h.source?.entityId);
    if (pattern.solid) {
      add(`solid:${color}`, { stroke: null, width: 0, fill: color, layer: 'HATCH' }, h.loops.map(loop).join(''));
      continue;
    }
    const segments = hatchSegments(h.loops, pattern, { scale: h.scale * HATCH_UNIT_M, angleDeg: 0, maxSegments: 20000 }).segments;
    const width = h.width ?? base.hatch;
    const who = subject(h.source?.ifcType, h.source?.entityId, h.source?.materialId);
    add(`hatch:${color}:${width}${who.key}`, { stroke: color, width, fill: null, layer: 'HATCH', ...who.tags }, segments.map((s) => `M${pt(s.a)}L${pt(s.b)}`).join(''));
  }
  // Fills first, then hatches, then lines (hidden, seen, cut).
  const order = (p: Pen) => (p.fill ? 0 : p.layer === 'HATCH' ? 1 : p.layer === 'HIDDEN' ? 2 : p.width < base.cut ? 3 : 4);
  return [...pens.values()].sort((a, b) => order(a) - order(b));
}
