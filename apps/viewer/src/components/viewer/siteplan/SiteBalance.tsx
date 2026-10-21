/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The site balance under a site plan viewport (#48): the plot area, the
 * built area (Ac), the gross floor area (Ad), POT and CUT. Every figure is
 * the urban indicators' (`useUrbanIndicators`, the same calculation and the
 * same site area as the indicators schedule), so the two tables cannot
 * disagree; the plot area is the one `urban/site-area.ts` picks (typed,
 * else the plot boundary drawn on the site plan, else the model's), and a
 * line under the table says which. Without any, it says so instead of a ratio.
 */

import { formatLocaleNumber, useTranslation } from '@/i18n';
import { NONE, wrapNote } from '@/urban/urban-layout';
import { penTags } from '../sheets/dxf-tags';
import { useSiteSourceNote, useUrbanIndicators } from '../urban/useUrban';

const FONT = 'ui-sans-serif, system-ui, sans-serif';
const WIDTH = 95;
const ROW = 5;
const NOTE_LINE = 3;
/** About the characters a 2 mm line holds across the table. */
const NOTE_CHARS = 88;

/** The site balance, paper millimetres from its top-left corner. */
export function SiteBalance({ x, y }: { x: number; y: number }) {
  const { t, locale } = useTranslation();
  const urban = useUrbanIndicators();
  const sourceNote = useSiteSourceNote();
  const r = urban?.result ?? null;
  const fixed = (v: number) => formatLocaleNumber(locale, v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const low = (text: string, atLeast: boolean | undefined) => (atLeast && text !== NONE ? t('urban.atLeast', { value: text }) : text);
  const area = (v: number | null | undefined) => (v === null || v === undefined ? NONE : t('site.balance.area', { value: fixed(v) }));
  const noSite = urban !== null && urban.site.source === null;
  const rows: [string, string][] = [
    [t('site.balance.plot'), noSite ? t('site.balance.noPlot') : area(r?.siteArea)],
    [t('site.balance.built'), low(area(r?.ac), r?.acAtLeast)],
    [t('site.balance.gross'), low(area(r?.ad), r?.adAtLeast)],
    // Ad for CUT gets its own row only when a level is left out of it: else it is Ad.
    ...(r && r.adCut !== r.ad ? [[t('site.balance.grossForCut'), low(area(r.adCut), r.adCutAtLeast)] as [string, string]] : []),
    [t('site.balance.pot'), low(r?.pot === null || r?.pot === undefined ? NONE : t('site.balance.percent', { value: fixed(r.pot) }), r?.acAtLeast)],
    [t('site.balance.cut'), low(r?.cut === null || r?.cut === undefined ? NONE : fixed(r.cut), r?.adCutAtLeast)],
  ];
  const notes = urban ? wrapNote(sourceNote(urban.site), NOTE_CHARS) : [];
  return (
    <g {...penTags('SITE-BALANCE', 0.25)} data-site-balance="true">
      <text x={x} y={y + 3.2} fontSize={3} fontWeight={700} fontFamily={FONT} fill="#000">{t('site.balance.title')}</text>
      <rect x={x} y={y + 5} width={WIDTH} height={ROW * rows.length} fill="none" stroke="#000" strokeWidth={0.25} />
      {rows.map(([label, value], i) => (
        <g key={label}>
          {i > 0 ? <line x1={x} y1={y + 5 + ROW * i} x2={x + WIDTH} y2={y + 5 + ROW * i} stroke="#000" strokeWidth={0.18} /> : null}
          <text x={x + 1.5} y={y + 5 + ROW * i + 3.6} fontSize={2.5} fontFamily={FONT} fill="#000">{label}</text>
          <text x={x + WIDTH - 1.5} y={y + 5 + ROW * i + 3.6} fontSize={2.5} fontFamily={FONT} fill="#000" textAnchor="end" data-value={label}>{value}</text>
        </g>
      ))}
      {notes.map((line, i) => (
        <text key={i} x={x} y={y + 5 + ROW * rows.length + 3.5 + i * NOTE_LINE} fontSize={2} fontFamily={FONT} fill="#52525b">{line}</text>
      ))}
    </g>
  );
}
