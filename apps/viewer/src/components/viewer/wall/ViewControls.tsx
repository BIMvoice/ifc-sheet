/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The controls beside a sheet on the Wall: a plan's cut height on a ruler
 * with the usual window sill and head marked, and a section's or elevation's
 * view depth. The wheel inside the drawing moves the same values.
 */

import { formatLocaleFixed, useTranslation } from '@/i18n';
import type { ProjectView } from '@/project/types';
import { CUT_HEIGHT_RANGE, nudgeViewDepth, setCutHeight } from './wall-actions';

/** The ruler's range, metres, and where a window's sill and head usually are. */
const RULER = { min: 0.5, max: 2.5 } as const;
const SILL_M = 0.9;
const HEAD_M = 2.1;
const RULER_PX = 220;

const yOf = (m: number): number => ((RULER.max - Math.min(RULER.max, Math.max(RULER.min, m))) / (RULER.max - RULER.min)) * RULER_PX;

export function CutHeightControl({ view }: { view: Extract<ProjectView, { kind: 'plan' }> }) {
  const { t, locale } = useTranslation();
  const ticks = [0.5, 1, 1.5, 2, 2.5];
  return (
    <div className="flex flex-col gap-3 text-sky-100">
      <span className="text-2xs font-medium uppercase tracking-widest text-sky-200/70">{t('wall.cutHeight')}</span>
      <span className="text-2xl font-light tabular-nums text-white">{formatLocaleFixed(locale, view.cutHeight, 2)}<span className="ml-1 text-sm text-sky-200/70">{t('wall.unitMetre')}</span></span>
      <div className="relative ml-16" style={{ height: RULER_PX }}>
        <input
          type="range"
          aria-label={t('wall.cutHeight')}
          min={RULER.min}
          max={RULER.max}
          step={CUT_HEIGHT_RANGE.step}
          value={Math.min(RULER.max, Math.max(RULER.min, view.cutHeight))}
          onChange={(e) => setCutHeight(view.id, Number(e.target.value))}
          className="absolute inset-y-0 -left-3 z-10 m-0 h-full w-6 cursor-ns-resize opacity-0 [direction:rtl] [writing-mode:vertical-lr]"
        />
        <div className="absolute inset-y-0 left-0 w-px bg-sky-300/40" />
        {ticks.map((m) => (
          <div key={m} className="absolute left-0 flex items-center" style={{ top: yOf(m) }}>
            <span className="h-px w-2 -translate-x-1 bg-sky-300/50" />
            <span className="ml-3 -translate-y-px text-xs tabular-nums text-sky-200/60">{formatLocaleFixed(locale, m, 1)}</span>
          </div>
        ))}
        {[[HEAD_M, 'wall.head'], [SILL_M, 'wall.sill']].map(([m, key]) => (
          <div key={key} className="absolute -left-14 flex items-center gap-2 text-xs text-sky-400" style={{ top: yOf(m as number) - 8 }}>
            <span className="w-8 text-right">{t(key as 'wall.head')}</span>
            <span className="h-px w-4 bg-sky-400" />
          </div>
        ))}
        <span className="pointer-events-none absolute -left-2.5 size-5 -translate-y-1/2 rounded-full bg-sky-400 shadow-[0_0_0_6px_rgba(56,189,248,0.25)]" style={{ top: yOf(view.cutHeight) }} />
      </div>
      <p className="m-0 max-w-[12rem] text-xs text-sky-200/70">{t('wall.cutHint')}</p>
    </div>
  );
}

export function DepthControl({ view }: { view: Extract<ProjectView, { kind: 'section' | 'elevation' }> }) {
  const { t, locale } = useTranslation();
  return (
    <div className="flex flex-col gap-3 text-sky-100">
      <span className="text-2xs font-medium uppercase tracking-widest text-sky-200/70">{t('wall.depth')}</span>
      <span className="text-2xl font-light tabular-nums text-white">
        {view.viewDepth == null ? t('wall.depthAuto') : <>{formatLocaleFixed(locale, view.viewDepth, 1)}<span className="ml-1 text-sm text-sky-200/70">{t('wall.unitMetre')}</span></>}
      </span>
      <div className="flex gap-2">
        <button type="button" className="rounded-full border border-sky-300/40 px-3 py-1 text-base hover:border-sky-300" aria-label={t('wall.depthLess')} onClick={() => nudgeViewDepth(view.id, -1)}>−</button>
        <button type="button" className="rounded-full border border-sky-300/40 px-3 py-1 text-base hover:border-sky-300" aria-label={t('wall.depthMore')} onClick={() => nudgeViewDepth(view.id, 1)}>+</button>
      </div>
      <p className="m-0 max-w-[12rem] text-xs text-sky-200/70">{t('wall.depthHint')}</p>
    </div>
  );
}
