/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The detail level of one drawing (#461), in its card's Graphics section: coarse, medium or fine for this view alone, or the
 * template's level / the scale's when none is set. The same write as the Model workspace's Visibility / Graphics dialog, which the
 * sheet shell covers.
 */

import { DETAIL_LEVELS, defaultDetailLevel, templateOf, type DetailLevel } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { updateProjectView, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { WALL_FIELD } from './wall-type';

const BY_PRESET = '';

export function ViewDetailLevel({ view }: { view: ProjectView }) {
  const { t } = useTranslation();
  const templates = useProjectStore((s) => s.viewTemplates);
  const graphics = view.graphics ?? {};
  const inherited = templateOf(view, templates ?? [])?.graphics.detailLevel;
  const set = (value: string): void => {
    const { detailLevel: _was, ...rest } = graphics;
    updateProjectView(view.id, { graphics: DETAIL_LEVELS.includes(value as DetailLevel) ? { ...rest, detailLevel: value as DetailLevel } : rest });
  };
  const level = (l: DetailLevel) => t(`viewGraphics.detail.${l}` as TranslationKey);
  return (
    <label className="mt-3 block text-xs text-sky-200">
      {t('viewGraphics.detail')}
      <select className={WALL_FIELD} value={graphics.detailLevel ?? BY_PRESET} onChange={(e) => set(e.target.value)}>
        <option value={BY_PRESET}>{inherited ? t('viewGraphics.detail.template', { level: level(inherited) }) : t('viewGraphics.detail.auto', { level: level(defaultDetailLevel(view.scale)) })}</option>
        {DETAIL_LEVELS.map((l) => <option key={l} value={l}>{level(l)}</option>)}
      </select>
    </label>
  );
}
