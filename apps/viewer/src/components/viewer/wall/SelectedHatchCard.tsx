/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The card for a hatched zone already drawn: with no tool running and a hatch
 * chosen, its pattern, scale and angle are the card (the tool's own card sets
 * only the next zone). It gives way to nothing: no hatch chosen, no card.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useDraftingSession } from '@/drafting/session';
import { useProjectStore } from '@/project/project-store';
import { HatchSettings, hatchesOf } from './HatchSettings';
import { WALL_CARD, WALL_CARD_TITLE, WALL_EYEBROW } from './wall-type';

/** The chosen hatches, or none (also a hook of its own: the caller decides which card shows). */
export function useSelectedHatches() {
  const selection = useDraftingSession((s) => s.selection);
  const drafts = useProjectStore((s) => s.drafts);
  return useMemo(() => hatchesOf(drafts.filter((d) => selection.has(d.id))), [drafts, selection]);
}

export function SelectedHatchCard({ hatches, drawingOn }: { hatches: ReturnType<typeof useSelectedHatches>; drawingOn?: string | null }) {
  const { t } = useTranslation();
  return (
    <aside className={WALL_CARD}>
      <p className={WALL_EYEBROW}>{drawingOn ? t('wall.draw.onDrawing', { name: drawingOn }) : t('wall.draw.onSheet')}</p>
      <h2 className={WALL_CARD_TITLE}>{t('wall.draw.hatch')}</h2>
      <HatchSettings selected={hatches} />
    </aside>
  );
}
