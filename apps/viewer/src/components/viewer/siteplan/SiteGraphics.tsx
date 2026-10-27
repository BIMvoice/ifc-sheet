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
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import type { AnnotationShape } from '@/drafting/types';
import type { Rect } from '@/siteplan/key-plan';
import { PLOT_BOUNDARY_LAYER } from '@/siteplan/plot';
import { COORDINATE_POINT_ID, NORTH_ARROW_ID, SCALE_BAR_ID, type LiveSymbolContext } from '@bimvoice/ifcsheet';
import { coordinateLabelBox, SITE_ARROW_SCALE, siteSymbolPlaces } from '@/siteplan/site-symbols';
import { AnnotationGraphics } from '../drafting/AnnotationGraphics';
import { shapePath } from '../drafting/DraftOverlay';
import { penTags } from '../sheets/dxf-tags';
import type { SiteContent } from './useSheetSite';
import { useSheetLocale } from '@/project/units-and-numbers';

const DIM_TEXT_MM = 2.5;
const NO_PATTERNS: never[] = [];
const ENCROACHMENT_COLOR = PLOT_BOUNDARY_LAYER.color;

/** Footprint and setbacks, in the viewport's drawing → paper transform. */
export function SiteOverlay({ site, transform: t, axis, scale }: { site: SiteContent; transform: ViewTransform; axis: SectionAxisName; scale: number }) {
  const locale = useSheetLocale();
  const height = (DIM_TEXT_MM * scale) / 1000;
  const fmt = (v: number) => sheetNumber(locale, v, 2, { kind: 'length' });
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

/** A key plan's outline of the part its keyed viewport shows, paper millimetres. */
export function KeyPlanHighlight({ rect }: { rect: Rect }) {
  return (
    <rect {...penTags('KEY-PLAN', 0.5, false, '#dc2626')} data-key-plan-highlight="true" x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="#dc2626" fillOpacity={0.12} stroke="#dc2626" strokeWidth={0.5} />
  );
}
