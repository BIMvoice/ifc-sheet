/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Copy, Move, Rotate and Mirror for the selected drafted elements, on a bar
 * under them, for a person who does not know the command line. Each button
 * starts the typed command of the same name (`drafting/commands/modify.ts`) on
 * the selection, so a button and the typed command cannot differ; the bar
 * steps aside while a command runs.
 */

import { Copy, FlipHorizontal2, Move, RotateCw } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { IconButton } from '@/components/ui/icon-button';
import { entityBounds } from '@/drafting/annotation';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import type { DraftEntity, Pt } from '@/drafting/types';

const BAR_HALF = 90;

const COMMANDS = [
  { id: 'copy', labelKey: 'drafting.sel.copy', icon: Copy },
  { id: 'move', labelKey: 'drafting.sel.move', icon: Move },
  { id: 'rotate', labelKey: 'drafting.sel.rotate', icon: RotateCw },
  { id: 'mirror', labelKey: 'drafting.sel.mirror', icon: FlipHorizontal2 },
] as const satisfies readonly { id: string; labelKey: TranslationKey; icon: unknown }[];

interface Props {
  entities: readonly DraftEntity[];
  transform: ViewTransform;
  axis: SectionAxisName;
  /** The drawing area's width (px): the bar stays inside it. */
  areaWidth: number;
}

export function ModifyBar({ entities, transform, axis, areaWidth }: Props) {
  const { t } = useTranslation();
  const running = useDraftingSession((s) => s.commandId !== null || s.selecting);
  if (running || entities.length === 0) return null;
  const corners: Pt[] = entities.flatMap((e) => {
    const b = entityBounds(e.shape);
    return [b.min, b.max, { x: b.min.x, y: b.max.y }, { x: b.max.x, y: b.min.y }];
  }).map((p) => drawingToScreen(p, transform, axis));
  const bottom = Math.max(...corners.map((p) => p.y));
  const centre = (Math.min(...corners.map((p) => p.x)) + Math.max(...corners.map((p) => p.x))) / 2;
  const left = Math.min(Math.max(centre, BAR_HALF), Math.max(BAR_HALF, areaWidth - BAR_HALF));
  return (
    <div
      role="toolbar"
      aria-label={t('drafting.sel.bar')}
      className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-zinc-200 bg-white/95 p-0.5 shadow-md dark:border-zinc-700 dark:bg-zinc-900/95 cursor-auto"
      style={{ left, top: bottom + 10 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {COMMANDS.map(({ id, labelKey, icon: Icon }) => (
        <IconButton key={id} label={t(labelKey)} className="size-7" onClick={() => startDraftCommand(id)}><Icon className="size-3.5" /></IconButton>
      ))}
    </div>
  );
}
