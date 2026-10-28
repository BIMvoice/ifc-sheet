/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { inSetOrder } from '@/project/drawing-register';
import { addProjectSheet, useProjectStore } from '@/project/project-store';
import { allTemplates } from '@/project/sheet-templates';
import { templateOptionLabel } from '../templateName';
import { Group, Row, action } from './parts';
import type { DrawerSection } from './types';

function Sheets({ go }: { go: (sheetId: string | null) => void }) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const ownTemplates = useProjectStore((s) => s.sheetTemplates);
  const [template, setTemplate] = useState('');
  /** A blank sheet, numbered in the "other" series, for whatever does not fit the rest. */
  const newSheet = (): void => {
    go(addProjectSheet(t('wall.project.newSheet'), 'other', template || undefined));
  };
  return (
    <Group title={t('wall.project.sheets')} add={(
      <>
        <select aria-label={t('wall.paper.newSheetTemplate')} className={`${action} max-w-[9rem] bg-transparent`} value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">{t('wall.paper.noTemplate')}</option>
          {allTemplates(ownTemplates).map((tpl) => <option key={tpl.id} value={tpl.id}>{templateOptionLabel(tpl, t)}</option>)}
        </select>
        <button type="button" className={action} onClick={newSheet}>{t('wall.project.addSheet')}</button>
      </>
    )}>
      {inSetOrder(sheets, schedules).map((s) => (
        <Row key={s.id} id={s.id} sub={s.number} label={s.name} onOpen={() => go(s.id)} />
      ))}
    </Group>
  );
}

/** The sheets, in the order of the set, with the "new sheet" row. */
export const sheetsSection: DrawerSection = { id: 'sheets', slot: 'body', order: 100, component: Sheets };
