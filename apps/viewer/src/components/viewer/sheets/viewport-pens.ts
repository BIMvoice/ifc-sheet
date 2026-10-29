/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A viewport's drawing as paper pens. Every face and line takes its style from the view's one styler (`project/view-styler.ts`,
 * the engine's `viewStyler`, #34) and is grouped by pen with the engine's `penGroups`: the drafting view draws the same item with
 * the same colour, weight, dash and fill, and so do the headless sheets of the command line. Cut fills keep their colour, and
 * category and material cut hatches are laid out in drawing units. Paths are grouped by pen, so a sheet stays a handful of SVG paths.
 *
 * A linked model's style (`project/model-styles.ts`, #96) is the styler's last word: a halftone element's stroke and fill go
 * lighter, keeping their weights; its hatch does here.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { HATCH_UNIT_M } from '@/drafting/annotation';
import { findPattern } from '@/drafting/hatch/library';
import { hatchSegments } from '@/drafting/hatch/fill';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { cutHatches, type StyledDrawing } from '@/project/view-graphics';
import { fillOrder } from '@/project/view-scheme-style';
import { DEFAULT_GRAPHIC_STANDARD, type GraphicStandard } from '@/drafting/graphic-standard';
import type { ResolvedViewGraphics } from '@/project/types';
import { halftoneColor, type EntityStyleOf } from '@/project/model-styles';
import { appViewStyler, materialOf } from '@/project/view-styler';
import { penGroups, penOrder, type ViewStyler } from '@bimvoice/ifcsheet';

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
  /**
   * A colour scheme's hatch over its rooms (#493): `d` holds the pattern's strokes, which the DXF leaves out; it writes the rooms
   * (`outline`, their loops) as a HATCH of the pattern `name` instead, the pattern drawn `unit` paper millimetres per pattern millimetre.
   */
  schemeHatch?: { name: string; outline: string; unit: number };
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

export function viewportPens(
  drawing: Drawing2D | StyledDrawing, graphics: ResolvedViewGraphics | undefined, t: ViewTransform, axis: SectionAxisName, extraPatterns: readonly HatchPattern[], cad?: CadPenContext,
  /** Each entity's model style; absent: every model draws normally. */
  styleOf?: EntityStyleOf,
  standard: GraphicStandard = DEFAULT_GRAPHIC_STANDARD,
  /** The view's styler; default: the app's for these inputs (`appViewStyler`), the one the drafting view draws with. */
  styler: ViewStyler = appViewStyler(graphics, drawing, standard, styleOf),
  /** Drawing metres one pattern millimetre of a colour scheme's hatch is (the scale the view is printed at, over 1000); default: 1:100. A pattern is drawn at its printed size whatever the scale. */
  schemeUnit: number = HATCH_UNIT_M,
): Pen[] {
  const base = standard.pens;
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
  const out: Pen[] = [];
  for (const g of penGroups(fillOrder(drawing), drawing.lines, styler, cad ? (l) => subject(l.ifcType, l.entityId).key : undefined)) {
    if (g.fill !== null) {
      out.push({ d: g.faces.map((p) => [p.polygon.outer, ...p.polygon.holes].map(loop).join('')).join(''), stroke: null, width: 0, fill: g.fill, layer: g.layer, ...(g.layer === 'COLOUR' ? { solid: true } : {}) });
      continue;
    }
    const first = g.lines[0];
    out.push({
      d: g.lines.map((l) => `M${pt(l.line.start)}L${pt(l.line.end)}`).join(''), stroke: g.stroke, width: g.width, fill: null,
      layer: g.layer, ...(g.dash ? { dash: g.dash } : {}), ...(first ? subject(first.ifcType, first.entityId).tags : {}),
    });
  }
  const ink = (colour: string, entityId: number | undefined) => (entityId !== undefined && styleOf?.(entityId) === 'halftone' ? halftoneColor(colour) : colour);
  const hatches = new Map<string, Pen>();
  const add = (key: string, pen: Omit<Pen, 'd'>, d: string) => {
    const known = hatches.get(key);
    if (known) known.d += d;
    else hatches.set(key, { ...pen, d });
  };
  for (const h of cutHatches(drawing, graphics, standard.materialHatch, materialOf)) {
    const pattern = findPattern(h.pattern, extraPatterns);
    if (!pattern) continue;
    if (h.scheme) {
      // A scheme's hatch is a pen of its own per pattern, so the DXF can write the rooms as one HATCH and skip the strokes.
      if (pattern.solid) continue;
      const segments = hatchSegments(h.loops, pattern, { scale: schemeUnit, angleDeg: 0, maxSegments: 20000 }).segments;
      const known = hatches.get(`scheme:${pattern.name}`);
      const d = segments.map((seg) => `M${pt(seg.a)}L${pt(seg.b)}`).join('');
      const outline = h.loops.map(loop).join('');
      if (known?.schemeHatch) { known.d += d; known.schemeHatch.outline += outline; }
      else hatches.set(`scheme:${pattern.name}`, { d, stroke: h.color, width: h.width ?? base.hatch, fill: null, layer: 'HATCH', schemeHatch: { name: pattern.name, outline, unit: schemeUnit * t.scale } });
      continue;
    }
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
  return [...out, ...hatches.values()].sort((a, b) => penOrder(a, base.cut) - penOrder(b, base.cut));
}
