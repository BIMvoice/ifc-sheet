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
import { RevisionPick } from './RevisionsCard';
import { ToolTypes } from './ToolTypes';
import { toolHelpKey } from './tool-help';
import { DRAW_TOOLS, WALL_TOOLS } from './wall-actions';
import { WALL_CARD, WALL_CARD_TITLE, WALL_EYEBROW } from './wall-type';

function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <aside className={WALL_CARD}>
      <p className={WALL_EYEBROW}>{eyebrow}</p>
      <h2 className={WALL_CARD_TITLE}>{title}</h2>
      {children}
    </aside>
  );
}

/** `drawingOn`: where a draw tool draws, the drawing's name, or null for the sheet's paper. */
export function InfoCard({ tool, drawingOn, onDone }: { tool: string; drawingOn?: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const ortho = useDraftingSession((o) => o.ortho || o.orthoHeld);
  const chosen = WALL_TOOLS.find((x) => x.command === tool);
  const orthoNote = ortho ? <output className="mb-0 mt-2 block text-xs font-medium text-white">{t('wall.ortho.on')}</output> : null;
  // Esc is never the only way out (#166): the tool ends from its own card.
  const done = <button type="button" onClick={onDone} className="mt-3 rounded-full border border-sky-300/40 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/80">{t('wall.tool.done')}</button>;
  const draw = DRAW_TOOLS.find((x) => x.command === tool);
  if (draw) {
    return (
      <Card eyebrow={drawingOn ? t('wall.draw.onDrawing', { name: drawingOn }) : t('wall.draw.onSheet')} title={t(draw.labelKey)}>
        <p className="m-0 leading-relaxed">{t(toolHelpKey(draw.command))}</p>
        {draw.command === 'hatch' ? <><ToolTypes tool="hatch" /><HatchSettings /></> : null}
        {draw.command === 'revcloud' ? <RevisionPick /> : null}
        <p className="mb-0 mt-3 text-xs text-cyan-300">{t('wall.drawHint')}</p>
        {orthoNote}
        {done}
      </Card>
    );
  }
  if (chosen) {
    return (
      <Card eyebrow={t(chosen.labelKey)} title={t(chosen.titleKey)}>
        <p className="m-0 leading-relaxed">{t(toolHelpKey(chosen.command))}</p>
        <ToolTypes tool={chosen.command} />
        <p className="mb-0 mt-4 flex items-start gap-2 text-cyan-300"><ToolIcon name="cube" size={22} accent="currentColor" />{t(chosen.hintKey ?? 'wall.drawHint')}</p>
        {orthoNote}
        {done}
      </Card>
    );
  }
  return null;
}
