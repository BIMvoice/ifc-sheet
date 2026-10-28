/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The whole set on one wall: every sheet hangs in view, grouped by kind
 * (plans, elevations, sections). Hover a sheet and press its cross to take it
 * away; double-click it to step into it. The scale of the plans, of the
 * elevations and of the sections is each one tap above the wall.
 */

import { Columns2, X, ZoomIn } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { SET_SCALES, sheetGroup, sheetScaleReason, type ModelExtent, type SetGroup } from '@/project/drawing-set';
import { groupScale, setGroupScale } from '@/project/drawing-set-actions';
import { removeProjectItem, useProjectStore } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { CardMarks } from './CardMarks';
import { pickForCompare, useWallCompare } from '@/wall/wall-compare';
import { startWallFill } from '@/wall/wall-fill';
import { startWallPromotion } from '@/wall/wall-promote';
import { useWallView } from '@/wall/wall-view';
import { SHEET_PX, useWallZoom } from '@/wall/wall-zoom';
import { LazyWallSheet } from './LazyWallSheet';
import { useWallHistoryKeys } from './useWallHistoryKeys';
import { useWallMeasure, WALL_SHEET_ATTR } from './useWallMeasure';
import { WallFind } from './WallFind';
import { useWallZoomControls } from './useWallZoom';
import { WallMiniMap } from './WallMiniMap';
import { WallZoomControl } from './WallZoomControl';
import { Hint } from '@/onboarding/Hint';
import { dismissHint } from '@/onboarding/hints';

const GROUPS: { group: SetGroup | null; labelKey: TranslationKey }[] = [
  { group: 'plans', labelKey: 'wall.group.plans' },
  { group: 'elevations', labelKey: 'wall.group.elevations' },
  { group: 'sections', labelKey: 'wall.group.sections' },
  { group: 'interiors', labelKey: 'wall.group.interiors' },
  { group: 'schedules', labelKey: 'wall.group.schedules' },
  { group: null, labelKey: 'wall.group.other' },
];

/** The groups whose sheets share a scale set above the wall. */
const SCALED: SetGroup[] = ['plans', 'elevations', 'sections'];

const SCALE_LABELS: Partial<Record<SetGroup, TranslationKey>> = {
  plans: 'wall.planScale',
  elevations: 'wall.elevationScale',
  sections: 'wall.sectionScale',
};

/**
 * `labelFromWide` keeps the group's name for a screen reader but draws it only from the 2xl breakpoint up: the sheet toolbar
 * needs that room for its buttons at 1280 px (#227).
 */
export function ScaleChips({ group, extent, labelFromWide = false }: { group: SetGroup; extent: ModelExtent | null; labelFromWide?: boolean }) {
  const { t } = useTranslation();
  const current = useProjectStore((s) => groupScale(group, s.sheets));
  return (
    <fieldset className="m-0 flex shrink-0 items-center gap-2 border-0 p-0">
      <legend className={cn('float-left mr-2 p-0 text-2xs font-medium uppercase tracking-widest text-sky-200/70', labelFromWide && 'sr-only 2xl:not-sr-only')}>{t(SCALE_LABELS[group] ?? 'wall.planScale')}</legend>
      {SET_SCALES.map((scale) => (
        <button
          key={scale}
          type="button"
          aria-pressed={current === scale}
          disabled={!extent}
          onClick={() => extent && setGroupScale(group, scale, extent)}
          className={cn(
            'whitespace-nowrap rounded-full border px-3 py-1 text-xs tabular-nums transition-colors',
            current === scale ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-300/30 text-sky-100 hover:border-sky-300/70',
          )}
        >
          1 : {scale}
        </button>
      ))}
    </fieldset>
  );
}

const SheetOnWall = memo(function SheetOnWall({ sheet, extent, width, onStep, onZoom }: { sheet: ProjectSheet; extent: ModelExtent | null; width: number; onStep: (id: string) => void; onZoom: (id: string) => void }) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const reason = extent ? sheetScaleReason(sheet, views, extent) : null;
  const name = `${sheet.number} ${sheet.name}`;
  // Near, wide enough and let in by the Wall's promotion (`wall-promote`): a few drawings at a time, not all at once.
  const near = useWallView((s) => s.drawn.includes(sheet.id));
  const flashed = useWallView((s) => s.highlight === sheet.id);
  const marked = useWallCompare((s) => s.pick === sheet.id);
  return (
    <figure {...{ [WALL_SHEET_ATTR]: sheet.id }} style={{ width }} data-flashed={flashed || undefined} className={cn('group relative m-0 rounded-sm transition-shadow duration-500', flashed && 'ring-4 ring-sky-300 shadow-[0_0_28px_rgba(125,211,252,0.7)]')}>
      <button
        type="button"
        aria-label={name}
        className="block cursor-zoom-in rounded-sm border-0 bg-transparent p-0 outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-sky-400"
        onDoubleClick={() => { dismissHint('openSheet'); onStep(sheet.id); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { dismissHint('openSheet'); onStep(sheet.id); }
        }}
      >
        <LazyWallSheet sheet={sheet} width={width} near={near} />
      </button>
      <CardMarks sheet={sheet} width={width} />
      <button
        type="button"
        data-wall-zoom-sheet={sheet.id}
        aria-label={t('wall.zoom.toSheet', { name })}
        title={t('wall.zoom.toSheet', { name })}
        onClick={() => onZoom(sheet.id)}
        className="absolute left-2 top-2 rounded-full bg-zinc-900/80 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <ZoomIn className="size-4" />
      </button>
      <button
        type="button"
        aria-label={t('wall.compare.pick', { name })}
        title={t('wall.compare.pick', { name })}
        aria-pressed={marked}
        onClick={() => pickForCompare(sheet.id)}
        className={cn('absolute left-10 top-2 rounded-full bg-zinc-900/80 p-1 text-white transition-opacity focus-visible:opacity-100', marked ? 'opacity-100 ring-2 ring-sky-300' : 'opacity-0 group-hover:opacity-100')}
      >
        <Columns2 className="size-4" />
      </button>
      <button
        type="button"
        aria-label={t('wall.remove', { name })}
        title={t('wall.remove', { name })}
        onClick={() => removeProjectItem(sheet.id)}
        className="absolute right-2 top-2 rounded-full bg-zinc-900/80 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-4" />
      </button>
      <figcaption className="mt-2 text-sm text-sky-100">
        <span className="font-semibold text-white">{sheet.number}</span> <span className="text-sky-200/80">{sheet.name}</span>
        {reason ? (
          <span className="mt-0.5 block text-xs text-sky-300/70">
            {t(reason.reason.key, reason.reason.params)}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
});

export function WallGrid({ extent, onStep }: { extent: ModelExtent | null; onStep: (sheetId: string) => void }) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const scroller = useRef<HTMLDivElement>(null);
  // Before the measuring below, so the first layout it reads is followed.
  useLayoutEffect(() => startWallPromotion(), []);
  const zoom = useWallZoomControls(scroller);
  const width = SHEET_PX * useWallZoom((s) => s.k);
  useWallHistoryKeys();
  const sheetIds = sheets.map((s) => s.id).join(',');
  // A document loaded with the same sheet ids forgets the Wall without changing them: measure and fill again.
  const generation = useWallView((s) => s.generation);
  useWallMeasure(scroller, `${generation}|${sheets.map((s) => `${s.id}:${sheetGroup(s) ?? ''}`).join(',')}`);
  // Started here, kept going after the Wall is gone; a sheet added starts it again.
  useEffect(() => startWallFill(), [sheetIds, generation]);
  const columns = GROUPS.map((g) => ({ ...g, sheets: sheets.filter((s) => sheetGroup(s) === g.group) })).filter((g) => g.sheets.length > 0);
  return (
    <div className="relative flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-10 gap-y-3 px-8 pt-6">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
          {SCALED.filter((g) => sheets.some((s) => sheetGroup(s) === g)).map((g) => <ScaleChips key={g} group={g} extent={extent} />)}
        </div>
        <WallFind />
      </div>
      <div ref={scroller} data-wall-scroller className="min-h-0 flex-1 overflow-auto px-8 pb-10 pt-6 data-[panning]:cursor-grab">
        <div className="flex flex-wrap items-start gap-10">
          {columns.map((col) => (
            <section key={col.labelKey} aria-label={t(col.labelKey)} className="flex flex-col gap-8">
              <h2 className="m-0 border-b border-sky-300/20 pb-2 text-xs font-medium uppercase tracking-widest text-sky-400">{t(col.labelKey)}</h2>
              {col.sheets.map((sheet) => <SheetOnWall key={sheet.id} sheet={sheet} extent={extent} width={width} onStep={onStep} onZoom={zoom.zoomToSheet} />)}
            </section>
          ))}
        </div>
        <p className="mt-10 max-w-xl text-sm text-sky-200/70">{t('wall.hint')}</p>
      </div>
      <Hint id="openSheet">{t('onboarding.hint.openSheet')}</Hint>
      <WallMiniMap />
      <WallZoomControl api={zoom} />
    </div>
  );
}
