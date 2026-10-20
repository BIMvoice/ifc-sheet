/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The card at the right of a stepped-into sheet while a tool is chosen: what
 * it does, and for a hatched zone, its pattern. Without a tool the chosen
 * drawing's own card shows instead (`ViewportCard`).
 */

import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n';
import { useDraftingSession } from '@/drafting/session';
import { ToolIcon } from '../ifcsheet/ToolIcon';
import { HatchSettings } from './HatchSettings';
import { ToolTypes } from './ToolTypes';
import { toolHelpKey } from './tool-help';
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
export function InfoCard({ tool, drawingOn }: { tool: string; drawingOn?: string | null }) {
  const { t } = useTranslation();
  const ortho = useDraftingSession((o) => o.ortho || o.orthoHeld);
  const chosen = WALL_TOOLS.find((x) => x.command === tool);
  const orthoNote = ortho ? <output className="mb-0 mt-2 block text-sm font-medium text-white">{t('wall.ortho.on')}</output> : null;
  const draw = DRAW_TOOLS.find((x) => x.command === tool);
  if (draw) {
    return (
      <Card eyebrow={drawingOn ? t('wall.draw.onDrawing', { name: drawingOn }) : t('wall.draw.onSheet')} title={t(draw.labelKey)}>
        <p className="m-0 text-lg leading-relaxed">{t(toolHelpKey(draw.command))}</p>
        {draw.command === 'hatch' ? <><ToolTypes tool="hatch" /><HatchSettings /></> : null}
        <p className="mb-0 mt-4 text-sm text-cyan-300">{t('wall.drawHint')}</p>
        {orthoNote}
      </Card>
    );
  }
  if (chosen) {
    return (
      <Card eyebrow={t(chosen.labelKey)} title={t(chosen.titleKey)}>
        <p className="m-0 text-lg leading-relaxed">{t(toolHelpKey(chosen.command))}</p>
        <ToolTypes tool={chosen.command} />
        <p className="mb-0 mt-4 flex items-start gap-2 text-cyan-300"><ToolIcon name="cube" size={22} accent="currentColor" />{t('wall.drawHint')}</p>
        {orthoNote}
      </Card>
    );
  }
  return null;
}
