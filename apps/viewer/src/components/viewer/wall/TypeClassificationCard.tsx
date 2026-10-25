/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's part for the quantities by type (#89): a classification column (the model's own codes, or the codes of one of the project's
 * mappings) and grouping the types under their code. Nothing for any other schedule. The rows come from `typeQuantitiesOf`, which the sheet, the tab
 * and the CSV and XLSX all read.
 */

import { useTranslation } from '@/i18n';
import { setScheduleClassification } from '@/classification/classification-actions';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSchedule } from '@/project/types';
import { systemLabel } from '@bimvoice/ifcsheet';
import { CardSection } from './CardSection';
import { WALL_FIELD } from './wall-type';

export function TypeClassificationCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const mappings = useProjectStore((s) => s.classificationMappings) ?? [];
  if (schedule.kind !== 'types') return null;
  const choice = schedule.classification;
  const shown = choice !== undefined;
  const mapping = mappings.find((m) => m.id === choice?.mapping);
  return (
    <CardSection id="classification" title={t('class.card.title')} summary={!shown ? t('class.card.off') : choice.group ? t('class.card.summaryGrouped', { system: mapping ? systemLabel(mapping.system) : t('class.card.model') }) : mapping ? systemLabel(mapping.system) : t('class.card.model')} defaultOpen={shown}>
      <p className="m-0 mt-1 text-xs text-sky-200">{t('class.card.hint')}</p>
      <label className="mt-2 flex items-center gap-2 text-xs text-sky-100">
        <input type="checkbox" checked={shown} onChange={(e) => setScheduleClassification(schedule.id, e.target.checked ? { mapping: mappings[0]?.id } : undefined)} />
        {t('class.card.show')}
      </label>
      {shown ? (
        <>
          <label className="mt-2 block text-xs text-sky-200">
            {t('class.card.system')}
            <select className={WALL_FIELD} value={choice.mapping ?? ''} onChange={(e) => setScheduleClassification(schedule.id, { ...choice, mapping: e.target.value || undefined })}>
              <option value="">{t('class.card.model')}</option>
              {mappings.map((m) => <option key={m.id} value={m.id}>{systemLabel(m.system)}</option>)}
            </select>
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-sky-100">
            <input type="checkbox" checked={choice.group === true} onChange={(e) => setScheduleClassification(schedule.id, { ...choice, group: e.target.checked })} />
            {t('class.card.group')}
          </label>
        </>
      ) : null}
    </CardSection>
  );
}
