/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Dimension tool's Chain switch on its card (#168), for a person who does not type SINGLE or CONTINUOUS. It is the
 * `dimContinuous` drafting setting those keywords set: on, each click adds a dimension from the last end; off, the tool
 * ends after one dimension. The setting lives in the drafting session, so it holds with the tool running or not.
 */

import { baseDraftSettings, patchDraftSettings, useDraftingSession } from '@/drafting/session';
import { useTranslation } from '@/i18n';

export function DimensionChainSwitch() {
  const { t } = useTranslation();
  useDraftingSession((s) => s.revision);
  const on = baseDraftSettings().dimContinuous;
  return (
    <div className="mt-4 text-xs text-sky-200">
      <label className="flex items-center gap-2">
        <input type="checkbox" role="switch" aria-checked={on} checked={on} onChange={(e) => patchDraftSettings({ dimContinuous: e.target.checked })} />
        {t('dimensionChain.label')}
      </label>
      <p className="mb-0 mt-1 text-sky-200/80">{t('dimensionChain.help')}</p>
    </div>
  );
}
