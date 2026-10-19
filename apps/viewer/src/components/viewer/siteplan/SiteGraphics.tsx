/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A site plan's own graphics on its sheet viewport, computed from the model
 * and the drawn plot boundary, never typed: the building footprint as a
 * heavy outline, a dimension per setback, and under the viewport a site
 * balance (plot area, footprint area, their ratio). The balance is
 * provisional: the urban indicators table, once merged, is the permit's.
 * And a key plan's outline of the part another viewport shows.
 */

import { useTranslation, formatLocaleNumber } from '@/i18n';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import type { AnnotationShape } from '@/drafting/types';
import type { Rect } from '@/siteplan/key-plan';
import { AnnotationGraphics } from '../drafting/AnnotationGraphics';
import { shapePath } from '../drafting/DraftOverlay';
import { penTags } from '../sheets/dxf-tags';
import type { SiteContent } from './useSheetSite';

const FONT = 'ui-sans-serif, system-ui, sans-serif';
const DIM_TEXT_MM = 2.5;
const NO_PATTERNS: never[] = [];

/** Footprint and setbacks, in the viewport's drawing → paper transform. */
export function SiteOverlay({ site, transform: t, axis, scale }: { site: SiteContent; transform: ViewTransform; axis: SectionAxisName; scale: number }) {
  const { locale } = useTranslation();
  const height = (DIM_TEXT_MM * scale) / 1000;
  const fmt = (v: number) => formatLocaleNumber(locale, v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <g data-site-plan="true">
      {site.footprint?.map((ring, i) => (
        <path key={i} {...penTags('SITE-FOOTPRINT', 0.7)} d={shapePath({ type: 'polyline', pts: ring, closed: true }, t, axis)} fill="none" stroke="#000" strokeWidth={0.7} strokeLinejoin="round" />
      ))}
      {site.setbacks.map((s) => {
        const dim: AnnotationShape = { type: 'dimension', variant: 'aligned', a: s.from, b: s.to, at: s.from, height, text: fmt(s.distance) };
        return (
          <g key={s.edge} {...penTags('SITE-SETBACKS', 0.18)} data-setback={s.distance.toFixed(3)}>
            <AnnotationGraphics shape={dim} color="#000" selected={false} transform={t} axis={axis} extraPatterns={NO_PATTERNS} strokeScale={0.25} paperUnit={scale / 1000} />
          </g>
        );
      })}
    </g>
  );
}

/** The site balance under a site plan viewport, paper millimetres from its top-left corner. */
export function SiteBalance({ site, x, y }: { site: SiteContent; x: number; y: number }) {
  const { t, locale } = useTranslation();
  const area = (v: number | null) => (v === null ? '—' : t('site.balance.area', { value: formatLocaleNumber(locale, v, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }));
  const ratio = site.plotArea && site.footprintArea !== null ? formatLocaleNumber(locale, site.footprintArea / site.plotArea, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const rows: [string, string][] = [
    [t('site.balance.plot'), area(site.plotArea)],
    [t('site.balance.footprint'), area(site.footprintArea)],
    [t('site.balance.ratio'), ratio],
  ];
  const w = 95;
  const rowH = 5;
  return (
    <g {...penTags('SITE-BALANCE', 0.25)} data-site-balance="true">
      <text x={x} y={y + 3.2} fontSize={3} fontWeight={700} fontFamily={FONT} fill="#000">{t('site.balance.title')}</text>
      <rect x={x} y={y + 5} width={w} height={rowH * rows.length} fill="none" stroke="#000" strokeWidth={0.25} />
      {rows.map(([label, value], i) => (
        <g key={label}>
          {i > 0 ? <line x1={x} y1={y + 5 + rowH * i} x2={x + w} y2={y + 5 + rowH * i} stroke="#000" strokeWidth={0.18} /> : null}
          <text x={x + 1.5} y={y + 5 + rowH * i + 3.6} fontSize={2.5} fontFamily={FONT} fill="#000">{label}</text>
          <text x={x + w - 1.5} y={y + 5 + rowH * i + 3.6} fontSize={2.5} fontFamily={FONT} fill="#000" textAnchor="end" data-value={label}>{value}</text>
        </g>
      ))}
      <text x={x} y={y + 5 + rowH * rows.length + 3.5} fontSize={2} fontFamily={FONT} fill="#52525b">{t('site.balance.note')}</text>
    </g>
  );
}

/** A key plan's outline of the part its keyed viewport shows, paper millimetres. */
export function KeyPlanHighlight({ rect }: { rect: Rect }) {
  return (
    <rect {...penTags('KEY-PLAN', 0.5, false, '#dc2626')} data-key-plan-highlight="true" x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="#dc2626" fillOpacity={0.12} stroke="#dc2626" strokeWidth={0.5} />
  );
}
