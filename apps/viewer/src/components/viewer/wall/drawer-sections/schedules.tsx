/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { addRegisterToSet, addScheduleToSet, hangSchedule } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { modelSiteArea } from '@/urban/urban-models';
import { ListScheduleAdd } from '../../lists/ListScheduleAdd';
import { SiteAreaField } from '../../urban/SiteAreaField';
import { ScheduleExportButtons } from '../ScheduleExportButtons';
import { EXPORT_BUTTON, Group, Row, action } from './parts';
import type { DrawerContext, DrawerSection } from './types';

function Schedules({ go }: DrawerContext) {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const models = useViewerStore((s) => s.models);
  // models: what `modelSiteArea` reads.
  const siteFromModel = useMemo(() => modelSiteArea(), [models]);
  return (
    <Group
      title={t('wall.group.schedules')}
      add={(
        <>
          <button type="button" className={action} onClick={() => go(addScheduleToSet('all', t('wall.project.joinerySchedule')))}>{t('wall.project.addJoinery')}</button>
          <button type="button" className={action} onClick={() => go(addScheduleToSet('materials', t('takeoff.newName')))}>{t('wall.project.addTakeoff')}</button>
          <button type="button" className={action} onClick={() => go(addRegisterToSet(t('register.name')))}>{t('wall.project.addRegister')}</button>
          <button type="button" className={action} onClick={() => go(addScheduleToSet('types', t('typeQty.newName')))}>{t('wall.project.addTypeQuantities')}</button>
          <button type="button" className={action} onClick={() => go(addScheduleToSet('finishes', t('finishes.newName')))}>{t('wall.project.addFinishes')}</button>
          <button type="button" className={action} onClick={() => go(addScheduleToSet('urban', t('urban.newName')))}>{t('urban.add')}</button>
          <button type="button" className={action} onClick={() => go(addScheduleToSet('boq', t('boq.newName')))}>{t('wall.project.addBoq')}</button>
          <button type="button" className={action} onClick={() => go(addScheduleToSet('rooms', t('roomSched.newName')))}>{t('roomSched.add')}</button>
          <ListScheduleAdd className={action} go={go} />
          <SiteAreaField
            modelSiteArea={siteFromModel}
            className="mt-1 flex w-full items-center justify-between gap-2 text-xs text-sky-200"
            inputClassName="w-36 rounded border border-sky-300/40 bg-[#061a36] px-1.5 py-1 text-xs text-white"
          />
        </>
      )}
    >
      {schedules.map((s) => <Row key={s.id} id={s.id} label={s.name} onOpen={() => go(hangSchedule(s.id))} extra={<ScheduleExportButtons schedule={s} named className={EXPORT_BUTTON} />} />)}
    </Group>
  );
}

/** The schedules, with a button for each kind a user can add. */
export const schedulesSection: DrawerSection = { id: 'schedules', slot: 'body', order: 1000, component: Schedules };
