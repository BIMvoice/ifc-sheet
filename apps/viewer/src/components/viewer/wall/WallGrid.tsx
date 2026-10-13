/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The whole set on one wall: every sheet hangs in view, grouped by kind
 * (plans, elevations, sections). Hover a sheet and press its cross to take it
 * away; double-click it to step into it. The scale of the plans is one tap
 * above the wall.
 */

import { X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { SET_SCALES, sheetGroup, type ModelExtent, type SetGroup } from '@/project/drawing-set';
import { groupScale, setGroupScale } from '@/project/drawing-set-actions';
import { removeProjectItem, useProjectStore } from '@/project/project-store';
import type { ProjectSheet } from '@/project/types';
import { WallSheet } from './WallSheet';

const GROUPS: { group: SetGroup | null; labelKey: TranslationKey }[] = [
  { group: 'plans', labelKey: 'wall.group.plans' },
  { group: 'elevations', labelKey: 'wall.group.elevations' },
  { group: 'sections', labelKey: 'wall.group.sections' },
  { group: null, labelKey: 'wall.group.other' },
];

/** Width of a sheet on the wall, px. */
const SHEET_PX = 340;

export function ScaleChips({ group, extent }: { group: SetGroup; extent: ModelExtent | null }) {
  const { t } = useTranslation();
  const current = useProjectStore((s) => groupScale(group, s.sheets));
  return (
    <fieldset className="m-0 flex items-center gap-2 border-0 p-0">
      <legend className="float-left mr-2 p-0 text-[11px] font-medium uppercase tracking-[0.2em] text-sky-200/70">{t('wall.planScale')}</legend>
      {SET_SCALES.map((scale) => (
        <button
          key={scale}
          type="button"
          aria-pressed={current === scale}
          disabled={!extent}
          onClick={() => extent && setGroupScale(group, scale, extent)}
          className={cn(
            'rounded-full border px-3 py-1 text-sm tabular-nums transition-colors',
            current === scale ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-300/30 text-sky-100 hover:border-sky-300/70',
          )}
        >
          1 : {scale}
        </button>
      ))}
    </fieldset>
  );
}

function SheetOnWall({ sheet, onStep }: { sheet: ProjectSheet; onStep: (id: string) => void }) {
  const { t } = useTranslation();
  const name = `${sheet.number} ${sheet.name}`;
  return (
    <figure className="group relative m-0">
      <button
        type="button"
        aria-label={name}
        className="block cursor-zoom-in rounded-sm border-0 bg-transparent p-0 outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-sky-400"
        onDoubleClick={() => onStep(sheet.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onStep(sheet.id);
        }}
      >
        <WallSheet sheet={sheet} width={SHEET_PX} />
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
      </figcaption>
    </figure>
  );
}

export function WallGrid({ extent, onStep }: { extent: ModelExtent | null; onStep: (sheetId: string) => void }) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const viewCount = sheets.reduce((n, s) => n + (s.viewports?.length ?? 0), 0);
  const columns = GROUPS.map((g) => ({ ...g, sheets: sheets.filter((s) => sheetGroup(s) === g.group) })).filter((g) => g.sheets.length > 0);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-8 pt-6">
        {sheets.some((s) => sheetGroup(s) === 'plans') ? <ScaleChips group="plans" extent={extent} /> : <span />}
        <span className="text-sm text-sky-200/70">{t('wall.summary', { sheets: sheets.length, views: viewCount })}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-8 pb-10 pt-6">
        <div className="flex flex-wrap items-start gap-10">
          {columns.map((col) => (
            <section key={col.labelKey} aria-label={t(col.labelKey)} className="flex flex-col gap-8">
              <h2 className="m-0 border-b border-sky-300/20 pb-2 text-xs font-medium uppercase tracking-[0.25em] text-sky-400">{t(col.labelKey)}</h2>
              {col.sheets.map((sheet) => <SheetOnWall key={sheet.id} sheet={sheet} onStep={onStep} />)}
            </section>
          ))}
        </div>
        <p className="mt-10 max-w-xl text-sm text-sky-200/70">{t('wall.hint')}</p>
      </div>
    </div>
  );
}
