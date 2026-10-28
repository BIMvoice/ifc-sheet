/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The detail level a view template carries (#444): "follow the scale" or coarse, medium, fine for every drawing that follows it. */

import { DETAIL_LEVELS, type DetailLevel, type ProjectViewTemplate } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { setTemplateDetailLevel } from '@/project/view-template-actions';
import { WALL_FIELD } from './wall-type';

const SMALL = `${WALL_FIELD} !mt-0 !w-auto !py-0.5 !text-xs`;
const FOLLOW_SCALE = '';

export function TemplateDetailLevel({ template }: { template: ProjectViewTemplate }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-sky-100">
      <span>{t('wall.tpl.detail')}</span>
      <select
        aria-label={t('wall.tpl.detail')} className={SMALL} value={template.graphics.detailLevel ?? FOLLOW_SCALE}
        onChange={(e) => setTemplateDetailLevel(template.id, DETAIL_LEVELS.includes(e.target.value as DetailLevel) ? (e.target.value as DetailLevel) : undefined)}
      >
        <option value={FOLLOW_SCALE}>{t('wall.tpl.detail.scale')}</option>
        {DETAIL_LEVELS.map((level) => <option key={level} value={level}>{t(`viewGraphics.detail.${level}` as TranslationKey)}</option>)}
      </select>
    </div>
  );
}
