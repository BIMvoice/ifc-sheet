/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { toggleOrtho, toggleSnap, useDraftingSession } from '@/drafting/session';
import { toggleTracking, useTrackingPref } from '@/drafting/tracking-pref';
import { useTranslation } from '@/i18n';
import { Toggle } from './Toggle';

/** The snap, ortho and tracking-line toggles of the drafting toolbar; tracking is remembered between sessions (#667). */
export function SnapToggles() {
  const { t } = useTranslation();
  const snap = useDraftingSession((s) => s.snap);
  const ortho = useDraftingSession((s) => s.ortho);
  const tracking = useTrackingPref((s) => s.on);
  return (
    <>
      <Toggle active={snap} label={t('drafting.snap')} onClick={toggleSnap} />
      <Toggle active={ortho} label={t('drafting.ortho')} onClick={toggleOrtho} />
      <Toggle active={tracking} label={t('tracking.toggle')} onClick={toggleTracking} />
    </>
  );
}
