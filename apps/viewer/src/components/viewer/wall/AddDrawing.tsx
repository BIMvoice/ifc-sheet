/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Add a drawing", in four big choices: a plan of a storey (pick the storey),
 * a section (draw a line on a plan), an elevation (pick a side), a detail of
 * an area (mark it on the drawing in front). A new drawing hangs on the set where its kind belongs.
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from '@/i18n';
import { ELEVATION_DIRECTIONS, planViewFor, resolvePlanLevel } from '@/project/view-defaults';
import { addProjectView, useProjectStore } from '@/project/project-store';
import type { ElevationDirection, PlanProjectView } from '@/project/types';
import { ToolIcon, type ToolIconName } from '../ifcsheet/ToolIcon';

interface AddDrawingProps {
  /** Hang a view made or found here; the sheet it lands on is stepped into. */
  onView: (viewId: string) => void;
  /** Start drawing a section line on a plan. */
  onSection: () => void;
  /** Start marking the area of a detail on the drawing in front. */
  onDetail: () => void;
  onClose: () => void;
}

const SIDE_NAMES: Record<ElevationDirection, string> = { north: 'North Elevation', east: 'East Elevation', south: 'South Elevation', west: 'West Elevation' };

function Choice({ icon, title, hint, disabled, onClick }: { icon: ToolIconName; title: string; hint: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex w-[200px] flex-col items-start gap-2 rounded-xl border border-sky-300/20 bg-white/5 p-4 text-left text-sky-50 hover:border-sky-300/70 disabled:opacity-40">
      <span className="flex h-24 w-full items-center justify-center rounded-lg bg-white text-[#0b1f3d]"><ToolIcon name={icon} size={56} accent="#0369a1" /></span>
      <span className="text-xl">{title}</span>
      <span className="text-sm text-cyan-300">{hint}</span>
    </button>
  );
}

function Picks({ children }: { children: ReactNode }) {
  return <div className="flex max-w-[640px] flex-wrap gap-2">{children}</div>;
}

const pick = 'rounded-full border border-sky-300/40 px-4 py-2 text-sky-50 hover:border-sky-300 hover:bg-sky-500/10';

export function AddDrawing({ onView, onSection, onDetail, onClose }: AddDrawingProps) {
  const { t } = useTranslation();
  const levels = useProjectStore((s) => s.levels);
  const [step, setStep] = useState<'kinds' | 'storey' | 'side'>('kinds');

  const planOf = (index: number): void => {
    const { views } = useProjectStore.getState();
    const level = levels[index];
    const existing = views.find((v): v is PlanProjectView => v.kind === 'plan' && resolvePlanLevel(v, [level]) !== undefined);
    if (existing) {
      onView(existing.id);
      return;
    }
    onView(addProjectView({ ...planViewFor(level, views), auto: false }));
  };
  const sideOf = (direction: ElevationDirection): void => {
    const existing = useProjectStore.getState().views.find((v) => v.kind === 'elevation' && v.direction === direction && !v.interior);
    onView(existing?.id ?? addProjectView({ kind: 'elevation', name: SIDE_NAMES[direction], direction }));
  };

  return (
    <section aria-label={t('wall.add.title')} className="flex items-center gap-8 rounded-2xl border border-sky-300/20 bg-[#0b2348]/95 p-6 shadow-2xl backdrop-blur">
      <div className="w-44 shrink-0">
        <h2 className="m-0 text-3xl font-light leading-tight text-white">{t('wall.add.title')}</h2>
        <p className="mb-4 mt-3 text-[11px] uppercase leading-relaxed tracking-[0.25em] text-cyan-400">{t('wall.add.kinds')}</p>
        <button type="button" onClick={step === 'kinds' ? onClose : () => setStep('kinds')} className="text-sm text-sky-300 underline-offset-4 hover:underline">{t('wall.add.close')}</button>
      </div>
      {step === 'kinds' ? (
        <div className="flex gap-4">
          <Choice icon="level" title={t('wall.add.plan')} hint={t('wall.add.planHint')} onClick={() => setStep('storey')} disabled={levels.length === 0} />
          <Choice icon="section" title={t('wall.add.section')} hint={t('wall.add.sectionHint')} onClick={onSection} />
          <Choice icon="symbol" title={t('wall.add.elevation')} hint={t('wall.add.elevationHint')} onClick={() => setStep('side')} />
          <Choice icon="plus" title={t('wall.add.detail')} hint={t('wall.add.detailHint')} onClick={onDetail} />
        </div>
      ) : step === 'storey' ? (
        <Picks>{levels.map((level, i) => <button key={level.name + level.elevation} type="button" className={pick} onClick={() => planOf(i)}>{level.name}</button>)}</Picks>
      ) : (
        <Picks>{ELEVATION_DIRECTIONS.map((d) => <button key={d} type="button" className={pick} onClick={() => sideOf(d)}>{SIDE_NAMES[d]}</button>)}</Picks>
      )}
    </section>
  );
}
