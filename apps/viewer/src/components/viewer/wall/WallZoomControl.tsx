/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The zoom control in the Wall's corner: out, the level (a click shows the reference sheet at its paper size, 100 %), in, and
 * Fit. The level is the reference sheet's width on screen over its paper width.
 */

import { Minus, Plus } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import { useWallView } from '@/wall/wall-view';
import { SHEET_PX, useWallZoom, zoomPercent } from '@/wall/wall-zoom';
import { referenceSheetId, type WallZoomApi } from './useWallZoom';

const button = 'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs text-sky-100 hover:bg-sky-300/15 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40';

export function WallZoomControl({ api }: { api: WallZoomApi }) {
  const { t } = useTranslation();
  const k = useWallZoom((s) => s.k);
  const current = useWallZoom((s) => s.current);
  // The reference sheet moves with the screen, so the level is read again when the Wall is.
  useWallView((s) => s.near);
  const sheets = useProjectStore((s) => s.sheets);
  const ref = sheets.find((s) => s.id === referenceSheetId()) ?? sheets.find((s) => s.id === current) ?? sheets[0];
  const percent = ref ? zoomPercent(SHEET_PX * k, paperOf(ref).w) : null;
  return (
    <fieldset data-wall-zoom aria-label={t('wall.zoom.label')} className="m-0 min-w-0 absolute bottom-4 left-6 z-10 flex items-center gap-0.5 rounded-md border border-sky-300/30 bg-[#061a36]/90 p-1 shadow-lg">
      <button type="button" className={button} aria-label={t('wall.zoom.out')} title={t('wall.zoom.out')} onClick={api.zoomOut}><Minus className="size-4" /></button>
      <button type="button" data-wall-zoom-level className={`${button} w-14 tabular-nums`} aria-label={t('wall.zoom.trueSize')} title={t('wall.zoom.trueSize')} onClick={api.trueSize}>
        {percent === null ? '' : t('wall.zoom.percent', { percent })}
      </button>
      <button type="button" className={button} aria-label={t('wall.zoom.in')} title={t('wall.zoom.in')} onClick={api.zoomIn}><Plus className="size-4" /></button>
      <button type="button" className={button} title={t('wall.zoom.fitTitle')} onClick={api.fit}>{t('wall.fit')}</button>
    </fieldset>
  );
}
