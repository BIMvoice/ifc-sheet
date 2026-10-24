/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A site plan's own graphics on its sheet viewport, computed from the model
 * and the drawn plot boundary, never typed: the building footprint as a
 * heavy outline and a dimension per setback (the site balance under the
 * viewport is `SiteBalance.tsx`). And a key plan's outline of the part
 * another viewport shows.
 */

import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { useTranslation } from '@/i18n';
import { drawingToScreen, screenToDrawing, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import type { AnnotationShape, SymbolInstanceShape } from '@/drafting/types';
import type { Rect } from '@/siteplan/key-plan';
import { PLOT_BOUNDARY_LAYER } from '@/siteplan/plot';
import { COORDINATE_POINT_ID, NORTH_ARROW_ID, SCALE_BAR_ID, type LiveSymbolContext } from '@/siteplan/live-symbols';
import { coordinateLabelBox, SITE_ARROW_SCALE, siteSymbolPlaces } from '@/siteplan/site-symbols';
import { AnnotationGraphics } from '../drafting/AnnotationGraphics';
import { shapePath } from '../drafting/DraftOverlay';
import { penTags } from '../sheets/dxf-tags';
import type { SiteContent } from './useSheetSite';

const DIM_TEXT_MM = 2.5;
const NO_PATTERNS: never[] = [];
const ENCROACHMENT_COLOR = PLOT_BOUNDARY_LAYER.color;

/** Footprint and setbacks, in the viewport's drawing → paper transform. */
export function SiteOverlay({ site, transform: t, axis, scale }: { site: SiteContent; transform: ViewTransform; axis: SectionAxisName; scale: number }) {
  const { locale } = useTranslation();
  const height = (DIM_TEXT_MM * scale) / 1000;
  const fmt = (v: number) => sheetNumber(locale, v);
  return (
    <g data-site-plan="true">
      {site.footprint?.map((ring, i) => (
        <path key={i} {...penTags('SITE-FOOTPRINT', 0.7)} d={shapePath({ type: 'polyline', pts: ring, closed: true }, t, axis)} fill="none" stroke="#000" strokeWidth={0.7} strokeLinejoin="round" />
      ))}
      {site.setbacks.map((s) => {
        const dim: AnnotationShape = { type: 'dimension', variant: 'aligned', a: s.from, b: s.to, at: s.from, height, text: fmt(s.distance) };
        // A negative setback: the building is over the plot line on that side, drawn in the plot boundary's red.
        const encroaches = s.distance < 0;
        const color = encroaches ? ENCROACHMENT_COLOR : '#000';
        return (
          <g key={s.edge} {...penTags('SITE-SETBACKS', 0.18, false, encroaches ? ENCROACHMENT_COLOR : undefined)} data-setback={s.distance.toFixed(3)} data-encroachment={encroaches ? 'true' : undefined}>
            <AnnotationGraphics shape={dim} color={color} selected={false} transform={t} axis={axis} extraPatterns={NO_PATTERNS} strokeScale={0.25} paperUnit={scale / 1000} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * The site plan's own north arrow and scale bar, each in a free spot of the
 * viewport (`siteplan/site-symbols.ts`), drawn through the live symbols so
 * the arrow turns to true north and the bar follows the viewport's scale.
 */
export function SiteSymbols({ site, transform: t, axis, scale, box, live, symbols }: {
  site: SiteContent; transform: ViewTransform; axis: SectionAxisName; scale: number; box: Rect; live: LiveSymbolContext;
  /** The symbols drafted on the view, as shown here: the coordinate points' labels are kept clear. */
  symbols: readonly SymbolInstanceShape[];
}) {
  const { locale } = useTranslation();
  const toPaper = (p: { x: number; y: number }) => drawingToScreen(p, t, axis);
  const labels = symbols.filter((s) => s.symbolId === COORDINATE_POINT_ID)
    .map((s) => coordinateLabelBox(toPaper(s.p), s.scale * t.scale, live.coordinates?.(s.p) ?? []));
  const places = siteSymbolPlaces({
    viewport: { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height }, scale, toPaper,
    boundary: site.boundary, footprint: site.footprint, setbacks: site.setbacks, labels,
    setbackText: (v) => sheetNumber(locale, v),
  });
  const arrow: AnnotationShape = { type: 'symbol', symbolId: NORTH_ARROW_ID, p: screenToDrawing(places.arrow, t, axis), scale: SITE_ARROW_SCALE / t.scale, rotation: 0, followsNorth: true };
  const bar: AnnotationShape = { type: 'symbol', symbolId: SCALE_BAR_ID, p: screenToDrawing(places.bar, t, axis), scale: 1, rotation: 0 };
  return (
    <g data-site-symbols="true">
      {[arrow, bar].map((shape, i) => (
        <g key={i} {...penTags('SITE-SYMBOLS', 0.25)} data-site-symbol={shape.type === 'symbol' ? shape.symbolId : undefined}>
          <AnnotationGraphics shape={shape} color="#000" selected={false} transform={t} axis={axis} extraPatterns={NO_PATTERNS} strokeScale={0.25} paperUnit={scale / 1000} symbols={live} />
        </g>
      ))}
    </g>
  );
}

/** A key plan's outline of the part its keyed viewport shows, paper millimetres. */
export function KeyPlanHighlight({ rect }: { rect: Rect }) {
  return (
    <rect {...penTags('KEY-PLAN', 0.5, false, '#dc2626')} data-key-plan-highlight="true" x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="#dc2626" fillOpacity={0.12} stroke="#dc2626" strokeWidth={0.5} />
  );
}
