/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The "What changed" entry in IfcSheet's top bar, and the panel it opens. */

import { lazy, Suspense } from 'react';
import { useTranslation } from '@/i18n';
import { closeFrontPanel, setPanel, useWallNav } from '../wall/wall-nav';
import { WALL_PILL } from '../wall/wall-type';

const Panel = lazy(() => import('./WhatChangedPanel').then((m) => ({ default: m.WhatChangedPanel })));

const quiet = WALL_PILL;

export function WhatChanged() {
  const { t } = useTranslation();
  // One of the Wall's panels: opening it closes the others, and Esc closes it (#296).
  const open = useWallNav((s) => s.panel === 'changed');
  return (
    <>
      <button type="button" aria-pressed={open} className={quiet} onClick={() => setPanel(open ? null : 'changed')}>{t('whatchanged.ui.open')}</button>
      {open ? <Suspense fallback={null}><Panel onClose={closeFrontPanel} /></Suspense> : null}
    </>
  );
}
