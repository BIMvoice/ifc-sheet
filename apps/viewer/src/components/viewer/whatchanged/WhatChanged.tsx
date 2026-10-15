/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The "What changed" entry in IfcSheet's top bar, and the panel it opens. */

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from '@/i18n';

const Panel = lazy(() => import('./WhatChangedPanel').then((m) => ({ default: m.WhatChangedPanel })));

const quiet = 'rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70';

export function WhatChanged() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-pressed={open} className={quiet} onClick={() => setOpen(!open)}>{t('whatchanged.ui.open')}</button>
      {open ? <Suspense fallback={null}><Panel onClose={() => setOpen(false)} /></Suspense> : null}
    </>
  );
}
