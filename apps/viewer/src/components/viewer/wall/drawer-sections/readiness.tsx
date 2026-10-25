/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { ReadinessList } from '../../sheets/ReadinessList';
import { WALL_SKIN } from '../../sheets/set-skin';
import { Collapsible } from './parts';
import type { DrawerSection } from './types';

function Readiness() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible title={t('ready.title')} onToggle={setOpen}>
      {/* Mounted only while open: reading the facts walks every entity of every model. */}
      {open ? <div className="mt-2 text-xs leading-relaxed"><ReadinessList skin={WALL_SKIN} /></div> : null}
    </Collapsible>
  );
}

/** What the model still lacks before the set can be issued. */
export const readinessSection: DrawerSection = { id: 'readiness', slot: 'body', order: 200, component: Readiness };
