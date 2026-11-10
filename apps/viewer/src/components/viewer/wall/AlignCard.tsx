/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The card shown while two or more drawings are chosen on a sheet (#168): who is chosen and which one is the anchor,
 * and the buttons that line them up or space them. The buttons run the same actions as the palette rows
 * (`ArrangeKeyId`); one that is not on offer (spacing needs three drawings) is disabled and says why.
 */

import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { shortcutLabel } from '@/lib/commands/shortcut-label';
import type { ArrangeKeyId, SteppedActions } from './stepped-keys';
import { WALL_CARD } from './wall-type';

const BUTTONS: readonly { id: ArrangeKeyId; icon: typeof AlignStartVertical }[] = [
  { id: 'wall.align.left', icon: AlignStartVertical },
  { id: 'wall.align.centreV', icon: AlignCenterVertical },
  { id: 'wall.align.right', icon: AlignEndVertical },
  { id: 'wall.align.top', icon: AlignStartHorizontal },
  { id: 'wall.align.centreH', icon: AlignCenterHorizontal },
  { id: 'wall.align.bottom', icon: AlignEndHorizontal },
  { id: 'wall.distribute.across', icon: AlignHorizontalSpaceBetween },
  { id: 'wall.distribute.down', icon: AlignVerticalSpaceBetween },
];

interface AlignCardProps {
  /** How many drawings are chosen. */
  count: number;
  /** The name of the anchor drawing: the first one chosen. */
  anchorName: string;
  arrange: SteppedActions['arrange'];
}

export function AlignCard({ count, anchorName, arrange }: AlignCardProps) {
  const { t } = useTranslation();
  return (
    <aside data-align-card className={WALL_CARD} aria-label={t('wall.align.group')}>
      <h2 className="text-sm font-semibold text-white">{t('wall.align.count', { count })}</h2>
      <p className="mt-1 text-xs text-sky-200">{t('wall.align.anchor', { name: anchorName })}</p>
      <fieldset className="m-0 mt-3 flex flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">{t('wall.align.group')}</legend>
        {BUTTONS.map(({ id, icon: Icon }) => {
          const run = arrange[id];
          const key = shortcutLabel(id);
          return (
            <button
              key={id}
              type="button"
              data-arrange={id}
              disabled={!run}
              aria-label={t(id)}
              title={run ? `${t(id)}${key ? ` (${key})` : ''}` : t('wall.align.needThree')}
              className="rounded-md border border-sky-300/30 p-1.5 text-sky-100 hover:border-sky-300/70 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => run?.()}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          );
        })}
      </fieldset>
      <p className="mt-3 text-xs text-sky-200">{t('wall.align.hint')}</p>
    </aside>
  );
}
