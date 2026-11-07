/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Two small buttons beside a selected door's symbol on a plan (#679): flip the swing, flip the hinge side. They are the graphics bar's
 * actions (#491) on the same per-view flips; the placement is `project/door-flip-buttons.ts`.
 */

import { memo, useMemo, type PointerEvent } from 'react';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import type { OpeningSymbol } from '@/drafting/opening-symbols';
import { useTranslation } from '@/i18n';
import { doorFlipPlacements } from '@/project/door-flip-buttons';
import { FLIP_HINGE, FLIP_SWING, flipOnDrawing } from '@/project/drawing-symbol-flips';
import { useViewerStore } from '@/store';

interface Props {
  symbols: readonly OpeningSymbol[];
  transform: ViewTransform;
  axis: SectionAxisName;
}

const BTN = 'flex h-6 w-6 items-center justify-center rounded-sm border border-zinc-300 bg-white/95 text-xs text-zinc-900 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100 dark:hover:bg-zinc-800';

/** A pointer down on a button must not reach the drawing underneath, which would start a drag. */
const keepOffDrag = (e: PointerEvent<HTMLButtonElement>) => e.stopPropagation();

export const DoorFlipButtons = memo(function DoorFlipButtons({ symbols, transform, axis }: Props) {
  const { t } = useTranslation();
  const selectedIds = useViewerStore((s) => s.selectedEntityIds);
  const selectedId = useViewerStore((s) => s.selectedEntityId);
  const placements = useMemo(() => {
    const ids = new Set<number>(selectedIds ?? []);
    if (selectedId !== null && selectedId !== undefined) ids.add(selectedId);
    return ids.size === 0 ? [] : doorFlipPlacements(symbols, ids, transform, axis);
  }, [symbols, selectedIds, selectedId, transform, axis]);
  return (
    <>
      {placements.map((p) => (
        <fieldset
          key={p.globalId} data-door-flip-buttons={p.globalId} aria-label={t('doorflip.group')}
          className="absolute z-10 m-0 flex min-w-0 cursor-default flex-col gap-0.5 border-0 p-0" style={{ left: p.left, top: p.top }}
        >
          <button type="button" className={BTN} aria-label={t('doorflip.swing')} title={t('doorflip.swing')} onPointerDown={keepOffDrag} onClick={() => flipOnDrawing([p.globalId], FLIP_SWING)}>
            <span aria-hidden="true">⇅</span>
          </button>
          <button type="button" className={BTN} aria-label={t('doorflip.hinge')} title={t('doorflip.hinge')} onPointerDown={keepOffDrag} onClick={() => flipOnDrawing([p.globalId], FLIP_HINGE)}>
            <span aria-hidden="true">⇄</span>
          </button>
        </fieldset>
      ))}
    </>
  );
});
