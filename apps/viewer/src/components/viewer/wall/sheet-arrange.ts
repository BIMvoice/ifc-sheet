/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawings chosen on a stepped-into sheet, and what lining them up does (#168). The first one chosen is the one whose
 * card shows and the anchor of every line-up. `arrangeActions` is the handler set the Wall's actions, the palette and the
 * card's buttons all run: `null` for what is not on offer (a line-up needs two chosen, spacing three).
 */

import { useCallback, useMemo, useState } from 'react';
import { MIN_TO_ALIGN, MIN_TO_DISTRIBUTE, alignViewports, distributeViewports, type AlignBox, type AlignMode, type DistributeAxis } from '@/project/viewport-align';
import type { SheetViewport } from '@/project/types';
import { NO_ARRANGE, type ArrangeKeyId } from './stepped-keys';

export interface SheetPicks {
  /** Chosen drawings in the order they were chosen; ones no longer on the sheet are left out. */
  picked: readonly string[];
  /** The first chosen: the one whose card shows. */
  chosen: string | null;
  /** A plain choice: this drawing alone, or none. */
  choose: (viewportId: string | null) => void;
  /** Shift+click: add the drawing to the chosen ones, or take it out. */
  toggle: (viewportId: string) => void;
}

export function useSheetPicks(viewports: readonly SheetViewport[]): SheetPicks {
  const [raw, setRaw] = useState<readonly string[]>([]);
  const picked = useMemo(() => raw.filter((id) => viewports.some((v) => v.id === id)), [raw, viewports]);
  const choose = useCallback((id: string | null): void => setRaw(id ? [id] : []), []);
  const toggle = useCallback((id: string): void => setRaw((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id])), []);
  return { picked, chosen: picked[0] ?? null, choose, toggle };
}

export function arrangeActions(sheetId: string, picked: readonly string[], viewports: readonly SheetViewport[], boxOf: (vp: SheetViewport) => { width: number; height: number }): Readonly<Record<ArrangeKeyId, (() => void) | null>> {
  if (picked.length < MIN_TO_ALIGN) return NO_ARRANGE;
  const boxes = picked.flatMap((id): AlignBox[] => {
    const vp = viewports.find((v) => v.id === id);
    return vp ? [{ id, x: vp.x, y: vp.y, ...boxOf(vp) }] : [];
  });
  const align = (mode: AlignMode) => () => { alignViewports(sheetId, boxes, mode); };
  const space = (axis: DistributeAxis) => (boxes.length >= MIN_TO_DISTRIBUTE ? () => { distributeViewports(sheetId, boxes, axis); } : null);
  return {
    'wall.align.left': align('left'), 'wall.align.right': align('right'), 'wall.align.top': align('top'), 'wall.align.bottom': align('bottom'),
    'wall.align.centreH': align('centreH'), 'wall.align.centreV': align('centreV'),
    'wall.distribute.across': space('across'), 'wall.distribute.down': space('down'),
  };
}
