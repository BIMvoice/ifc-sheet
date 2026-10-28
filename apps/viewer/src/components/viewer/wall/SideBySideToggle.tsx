/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "Place parts side by side" (#186): whether the parts of a split schedule are hung next to each other on as few sheets as they fit, instead of one sheet each. */

import { useTranslation } from '@/i18n';
import { WALL_PILL } from './wall-type';

export function SideBySideToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" data-side-by-side aria-pressed={on} className={`${WALL_PILL} aria-pressed:border-sky-300 aria-pressed:bg-sky-400/25 aria-pressed:text-white`} onClick={() => onChange(!on)}>
      {t('wall.fitOffer.sideBySide')}
    </button>
  );
}
