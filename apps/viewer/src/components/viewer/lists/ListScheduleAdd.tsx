/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "New schedule" in the project drawer's schedules (#78): opens the builder, and steps into the sheet the new schedule is hung on. */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { ListScheduleBuilder } from './ListScheduleBuilder';

export function ListScheduleAdd({ className, go }: { className: string; go: (sheetId: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{t('listSched.add')}</button>
      {open ? <ListScheduleBuilder onClose={() => setOpen(false)} onCreated={go} /> : null}
    </>
  );
}
