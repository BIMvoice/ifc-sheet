/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The card at the right of a stepped-into sheet: what the chosen tool does,
 * or with no tool, the chosen drawing's one control (a plan's cut height, a
 * section's depth) and what was left out on purpose.
 */

import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n';
import type { ProjectView } from '@/project/types';
import { ToolIcon } from '../ifcsheet/ToolIcon';
import { CutHeightControl, DepthControl } from './ViewControls';
import { HatchSettings } from './HatchSettings';
import { DRAW_TOOLS, WALL_TOOLS } from './wall-actions';

function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <aside className="w-[340px] rounded-2xl border border-sky-300/20 bg-[#0b2348]/95 p-6 text-sky-100 shadow-2xl backdrop-blur">
      <p className="m-0 text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{eyebrow}</p>
      <h2 className="mb-4 mt-2 text-[28px] font-light leading-tight text-white">{title}</h2>
      {children}
    </aside>
  );
}

/** `drawingOn`: where a draw tool draws, the drawing's name, or null for the sheet's paper. */
export function InfoCard({ tool, view, drawingOn }: { tool: string | null; view: ProjectView | null; drawingOn?: string | null }) {
  const { t } = useTranslation();
  const chosen = WALL_TOOLS.find((x) => x.command === tool);
  const draw = DRAW_TOOLS.find((x) => x.command === tool);
  if (draw) {
    return (
      <Card eyebrow={drawingOn ? t('wall.draw.onDrawing', { name: drawingOn }) : t('wall.draw.onSheet')} title={t(draw.labelKey)}>
        <p className="m-0 text-lg leading-relaxed">{t(draw.bodyKey)}</p>
        {draw.command === 'hatch' ? <HatchSettings /> : null}
        <p className="mb-0 mt-4 text-sm text-cyan-300">{t('wall.drawHint')}</p>
      </Card>
    );
  }
  if (chosen) {
    return (
      <Card eyebrow={t(chosen.labelKey)} title={t(chosen.titleKey)}>
        <p className="m-0 text-lg leading-relaxed">{t(chosen.bodyKey)}</p>
        <p className="mb-0 mt-4 flex items-start gap-2 text-cyan-300"><ToolIcon name="cube" size={22} accent="currentColor" />{t('wall.drawHint')}</p>
      </Card>
    );
  }
  if (view?.kind === 'plan' || view?.kind === 'section' || view?.kind === 'elevation') {
    return (
      <Card eyebrow={view.name} title={view.kind === 'plan' ? t('wall.cutHeight') : t('wall.depth')}>
        {view.kind === 'plan' ? <CutHeightControl view={view} /> : <DepthControl view={view} />}
      </Card>
    );
  }
  return (
    <Card eyebrow={t('wall.leftOut.eyebrow')} title={t('wall.leftOut.title')}>
      <ul className="m-0 list-none divide-y divide-sky-300/20 border-y border-sky-300/20 p-0 text-lg text-sky-300">
        {(['wall.leftOut.lines', 'wall.leftOut.layers', 'wall.leftOut.grid'] as const).map((k) => <li key={k} className="py-2.5">{t(k)}</li>)}
      </ul>
      <p className="mb-0 mt-4 text-lg leading-relaxed">{t('wall.leftOut.body')}</p>
    </Card>
  );
}
