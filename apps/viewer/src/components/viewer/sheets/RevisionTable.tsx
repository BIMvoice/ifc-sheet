/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The revision table of a sheet, drawn above the title block: a header and one
 * row per revision the sheet has, in order. The layout is `project/revision-table.ts`.
 */

import { useTranslation } from '@/i18n';
import { REVISION_COLUMNS_MM, REVISION_FONT_MM, REVISION_ROW_MM, revisionTableLayout } from '@/project/revision-table';
import { FRAME_MARGIN_MM, TITLE_BLOCK_MM } from '@/project/sheets';
import type { ProjectRevision } from '@/project/types';
import { penTags } from './dxf-tags';

const FONT = 'ui-sans-serif, system-ui, sans-serif';

export function RevisionTable({ revisions, w, h }: { revisions: readonly ProjectRevision[]; w: number; h: number }) {
  const { t } = useTranslation();
  if (revisions.length === 0) return null;
  const { rows, hidden } = revisionTableLayout(revisions, [t('revision.table.code'), t('revision.table.date'), t('revision.table.description'), t('revision.table.by')]);
  const width = TITLE_BLOCK_MM.w;
  const height = rows.length * REVISION_ROW_MM;
  const x = w - FRAME_MARGIN_MM - width;
  const y = h - FRAME_MARGIN_MM - TITLE_BLOCK_MM.h - height;
  const edges = REVISION_COLUMNS_MM.reduce<number[]>((acc, c) => [...acc, acc[acc.length - 1] + c], [0]);
  return (
    <g {...penTags('REVISION-TABLE', 0.25)} data-revision-table="true">
      <rect x={x} y={y} width={width} height={height} fill="#fff" stroke="#000" strokeWidth={0.5} />
      {rows.slice(1).map((_, i) => <line key={i} x1={x} y1={y + REVISION_ROW_MM * (i + 1)} x2={x + width} y2={y + REVISION_ROW_MM * (i + 1)} stroke="#000" strokeWidth={0.18} />)}
      {edges.slice(1, -1).map((e) => <line key={e} x1={x + e} y1={y} x2={x + e} y2={y + height} stroke="#000" strokeWidth={0.18} />)}
      {rows.map((cells, r) => cells.map((text, c) => (
        <text key={`${r}:${c}`} x={x + edges[c] + 1.5} y={y + REVISION_ROW_MM * r + REVISION_ROW_MM * 0.7} fontSize={REVISION_FONT_MM} fontFamily={FONT} fontWeight={r === 0 ? 700 : 400} fill={r === 0 ? '#52525b' : '#000'}>{text}</text>
      )))}
      {hidden > 0 ? <text x={x} y={y - 1} fontSize={2} fontFamily={FONT} fill="#52525b">{t('revision.table.earlier', { count: hidden })}</text> : null}
    </g>
  );
}
