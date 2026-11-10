/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The selection's turn handle (#168): a small circular arrow above the selected drafted elements. The canvas's
 * pointer hook picks it up (`turnHandleOf` / `onTurnHandle`), so a press on it reaches the same code as any other
 * press; this only draws it, turned with the selection while it is dragged, with the angle beside it.
 */

import { RotateCw } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { turnHandleOf, turnedHandleAt, type SelectionTurn } from '@/drafting/turn-selection';
import { visibleEntities } from '@/drafting/session';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import type { Pt } from '@/drafting/types';

const PAPER = '#ffffff';

interface Props {
  viewId: string;
  selection: ReadonlySet<string>;
  transform: ViewTransform;
  axis: SectionAxisName;
  /** The turn under way, if any, and the cursor (drawing units): the angle shows beside it. */
  turn: SelectionTurn | null;
  cursor: Pt | null;
}

export function TurnHandle({ viewId, selection, transform, axis, turn, cursor }: Props) {
  const { t } = useTranslation();
  const handle = turnHandleOf(selection, visibleEntities(viewId), transform, axis);
  if (!handle) return null;
  const at = turn ? turnedHandleAt(turn, handle.at, transform, axis) : handle.at;
  const label = turn && cursor ? drawingToScreen(cursor, transform, axis) : null;
  return (
    <>
      <div
        data-turn-handle
        // A picture only: the drawing takes the drag, so screen readers skip it.
        aria-hidden="true"
        title={t('drafting.turn.handle')}
        className="pointer-events-none absolute z-20 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-sky-600 text-sky-700 shadow-sm"
        // On the paper, which stays white in dark mode (the theme remaps `bg-white`).
        style={{ left: at.x, top: at.y, background: PAPER }}
      >
        <RotateCw className="size-3.5" />
      </div>
      {turn && label ? (
        <div data-turn-angle className="pointer-events-none absolute z-20 rounded-sm px-1 text-2xs tabular-nums text-zinc-700 shadow-sm" style={{ left: label.x + 16, top: label.y - 24, background: PAPER }}>
          {t('drafting.turn.angle', { angle: turn.degrees })}
        </div>
      ) : null}
    </>
  );
}
