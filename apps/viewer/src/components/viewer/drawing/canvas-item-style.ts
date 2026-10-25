/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The style `Drawing2DCanvas` paints each cut face and line with, decided outside the canvas (#34). Two sources:
 *
 *  - a project view (the drafting view): the view's one styler (`project/view-styler.ts`, the engine's `viewStyler`), the same
 *    one the sheets, their PDF and DXF and the view's DXF pen with, so the drafting view shows what prints;
 *  - the legacy Drawing panel (`useDrawingViewModel`): its own look, unchanged — a preset's override engine, IFC material colours,
 *    the IFC class fallback palette and the paper theme. It is left alone, as #34 allows; it is not a project view.
 *
 * Weights are paper millimetres and dashes paper millimetres; the canvas maps both to the screen.
 */

import type { DrawingLine, DrawingPolygon, ElementData, GraphicOverrideEngine } from '@ifc-lite/drawing-2d';
import type { ViewStyler } from '@bimvoice/ifcsheet';
import { getFillColorForType } from './ifc-fill-colors';
import type { DrawingPaperTheme } from './paper-theme';

export interface CanvasFaceStyle {
  fill: string;
  opacity: number;
  /** The outline: the cut pen. */
  stroke: string;
  weight: number;
  dash: readonly number[];
}

export interface CanvasLineStyle {
  stroke: string;
  weight: number;
  dash: readonly number[];
}

export interface CanvasStyler {
  face(polygon: DrawingPolygon): CanvasFaceStyle;
  /** Null: not drawn by the canvas. */
  line(line: DrawingLine): CanvasLineStyle | null;
}

const NO_DASH: readonly number[] = [];

/** A project view's canvas style: the view's styler, unchanged. A cut line is the cut face's outline, which the face draws. */
export function viewCanvasStyler(styler: ViewStyler): CanvasStyler {
  return {
    face: (p) => {
      const s = styler.face(p);
      return { fill: s.fill ?? '#ffffff', opacity: 1, stroke: s.stroke, weight: s.weight, dash: s.dash };
    },
    line: (l) => {
      const s = styler.line(l);
      return s.visible && s.kind !== 'cut' ? { stroke: s.stroke, weight: s.weight, dash: s.dash } : null;
    },
  };
}

export interface LegacyCanvasInputs {
  /** The canvas draws a sheet (paper, frame, title block) with the drawing in its viewport. */
  sheetMode: boolean;
  overrideEngine?: GraphicOverrideEngine;
  overridesEnabled: boolean;
  entityColorMap: Map<number, [number, number, number, number]>;
  useIfcMaterials: boolean;
  getElementProperties: (entityId: number) => ElementData['properties'];
  paperTheme: DrawingPaperTheme;
}

const hex = (c: readonly number[]) => `#${c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
/** The Drawing panel's line pens by line kind, paper mm. */
const LEGACY_PEN: Partial<Record<string, number>> = { projection: 0.25, hidden: 0.18, silhouette: 0.5, crease: 0.18, boundary: 0.25, annotation: 0.13 };

/** The legacy Drawing panel's look, as the canvas drew it before #34. Its dashes are screen pixels in sheet mode. */
export function legacyCanvasStyler(o: LegacyCanvasInputs): CanvasStyler {
  const ink = o.sheetMode ? '#000000' : o.paperTheme.ink;
  const dashed = o.sheetMode ? [4, 2] : [2, 1];
  const ruled = (p: DrawingPolygon) => o.overrideEngine!.applyOverrides({ expressId: p.entityId, ifcType: p.ifcType, properties: o.getElementProperties(p.entityId) }).style;
  return {
    face: (p) => {
      // Fill: IFC materials > the override engine > the IFC class fallback.
      let fill = getFillColorForType(p.ifcType, o.sheetMode ? undefined : o.paperTheme.isDark);
      let opacity = 1;
      let stroke = ink;
      let weight = 0.5;
      const style = o.overridesEnabled && o.overrideEngine ? ruled(p) : null;
      const material = o.useIfcMaterials ? p.color ?? o.entityColorMap.get(p.entityId) : undefined;
      if (material) {
        fill = hex(material);
        opacity = material[3];
      } else if (!o.useIfcMaterials && style) {
        fill = style.fillColor;
        opacity = style.opacity;
      }
      if (style) {
        stroke = style.strokeColor;
        weight = style.lineWeight;
      }
      return { fill, opacity, stroke, weight, dash: NO_DASH };
    },
    line: (l) => {
      let stroke = ink;
      let weight = LEGACY_PEN[l.category] ?? 0.25;
      let dash: readonly number[] = NO_DASH;
      if (l.category === 'hidden') {
        stroke = '#666666';
        dash = dashed;
      }
      if (l.visibility === 'hidden') {
        stroke = '#888888';
        dash = dashed;
        weight *= 0.7;
      }
      return { stroke, weight, dash };
    },
  };
}
