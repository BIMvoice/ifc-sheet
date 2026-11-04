/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #666: one line on the drawing that says how to select several elements at once. Window and crossing selection were in the
 * drawing from the start, but nothing said so, and a drag on the canvas looked like it would pan (it does not: the middle button pans).
 * Shown while nothing is selected and no tool runs.
 */
import { useTranslation } from '@/i18n';
import { useDraftingSession } from '@/drafting/session';

export function RegionSelectHint({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation();
  const nothingSelected = useDraftingSession((s) => s.selection.size === 0);
  if (hidden || !nothingSelected) return null;
  return (
    <p data-testid="region-select-hint" className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[28rem] rounded bg-white/80 px-2 py-1 text-2xs leading-snug text-zinc-600">
      {t('regionSelect.hint')}
    </p>
  );
}
