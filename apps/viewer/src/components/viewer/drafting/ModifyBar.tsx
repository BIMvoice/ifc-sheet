/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Copy, Move, Rotate, Flip left to right, Flip up and down, Bring to front, Send to back and Fill (#681) for the
 * selected drafted elements, on a bar under them, for a person who does not know the command line. Each button
 * starts the typed command of the same name (`drafting/commands/modify.ts`, FLIP in `flip.command.ts`) on
 * the selection, so a button and the typed command cannot differ; the bar
 * steps aside while a command runs. The flips act at once (#168); "Keep the original" makes them add a mirrored copy.
 */

import { useState } from 'react';
import { BringToFront, Copy, FlipHorizontal2, FlipVertical2, Merge, PaintBucket, Move, RotateCw, SendToBack } from 'lucide-react';
import { fillLoopsOf } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { IconButton } from '@/components/ui/icon-button';
import { isGeometry } from '@/drafting/types';
import { entityBounds } from '@/drafting/annotation';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { startDraftCommand, useDraftingSession } from '@/drafting/session';
import type { DraftEntity, Pt } from '@/drafting/types';

/** Half the bar's width (px), roughly: it stays inside the drawing area. */
const BAR_HALF = 210;

type BarCommand = { id: string; labelKey: TranslationKey; icon: typeof Copy };

const COMMANDS = [
  { id: 'copy', labelKey: 'drafting.sel.copy', icon: Copy },
  { id: 'move', labelKey: 'drafting.sel.move', icon: Move },
  // The typed route to an exact angle; the handle above the selection turns it by dragging (#168).
  { id: 'rotate', labelKey: 'drafting.sel.rotate', icon: RotateCw },
] as const satisfies readonly BarCommand[];

/** The flips (#168), about the selection's centre; the typed MIRROR (about a line picked) stays on the command line. */
const FLIPS = [
  { id: 'h', labelKey: 'drafting.sel.flipH', icon: FlipHorizontal2 },
  { id: 'v', labelKey: 'drafting.sel.flipV', icon: FlipVertical2 },
] as const satisfies readonly BarCommand[];

const ORDER = [
  // What draws on top (#682): they act at once on the selection.
  { id: 'join', labelKey: 'drafting.sel.join', icon: Merge },
  { id: 'bringtofront', labelKey: 'drafting.sel.front', icon: BringToFront },
  { id: 'sendtoback', labelKey: 'drafting.sel.back', icon: SendToBack },
] as const satisfies readonly BarCommand[];

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
  const [keep, setKeep] = useState(false);
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
      {FLIPS.map(({ id, labelKey, icon: Icon }) => (
        <IconButton key={id} label={t(labelKey)} className="size-7" onClick={() => startDraftCommand('flip', keep ? `${id} keep` : id)}><Icon className="size-3.5" /></IconButton>
      ))}
      <label className="flex items-center gap-1 px-1 text-2xs text-zinc-700 dark:text-zinc-300">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-3" />
        {t('drafting.sel.flipKeep')}
      </label>
      <span className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
      {ORDER.map(({ id, labelKey, icon: Icon }) => (
        <IconButton key={id} label={t(labelKey)} className="size-7" onClick={() => startDraftCommand(id)}><Icon className="size-3.5" /></IconButton>
      ))}
      {/* A closed shape made an opaque fill that hides what is behind it (#681): white, or the colour picked. */}
      {entities.some((e) => isGeometry(e.shape) && fillLoopsOf(e.shape)) ? (
        <>
          <IconButton label={t('drafting.sel.fill')} className="size-7" onClick={() => startDraftCommand('fill')}><PaintBucket className="size-3.5" /></IconButton>
          <input type="color" defaultValue="#ffffff" aria-label={t('drafting.sel.fillColour')} title={t('drafting.sel.fillColour')} className="size-6 cursor-pointer rounded-sm border border-zinc-300 bg-transparent p-0 dark:border-zinc-700" onChange={(e) => startDraftCommand('fill', e.target.value)} />
        </>
      ) : null}
    </div>
  );
}
