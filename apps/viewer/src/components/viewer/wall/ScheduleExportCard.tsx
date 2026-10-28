/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The viewport card's Export section for a placed schedule (#80): CSV and XLSX of the table the sheet prints. */

import { useTranslation } from '@/i18n';
import { csvDelimiter } from '@/joinery/schedule-export';
import type { ProjectSchedule } from '@/project/types';
import { CardSection } from './CardSection';
import { ScheduleExportButtons } from './ScheduleExportButtons';

export function ScheduleExportCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t, locale } = useTranslation();
  return (
    <CardSection id="export" title={t('wall.export.title')} summary={t('wall.export.summary')} defaultOpen>
      <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.export.hint', { delimiter: t(csvDelimiter(locale) === ';' ? 'wall.export.semicolon' : 'wall.export.comma') })}</p>
      <div className="mt-2 flex flex-wrap gap-2"><ScheduleExportButtons schedule={schedule} /></div>
    </CardSection>
  );
}
