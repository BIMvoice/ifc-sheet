/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What shows and at which line weight, one row per element category (#44). One list for two targets: a drawing's card (the
 * rows show what the drawing draws, a dot marks the ones it overrides of its template) and a view template in the drawer (the
 * rows are the template's, and a change reaches every drawing that follows it). It only reads and reports; the caller says where a
 * change is written (`view-template-actions.ts`).
 */

import { useTranslation, type TranslationKey } from '@/i18n';
import { VIEW_CATEGORIES } from '@/project/view-graphics';
import type { CategoryGraphics, CategoryLineWeight } from '@/project/types';
import { WALL_FIELD } from './wall-type';

const WEIGHTS: readonly CategoryLineWeight[] = ['heavy', 'medium', 'light', 'hairline'];
const WEIGHT_KEYS = {
  heavy: 'viewGraphics.weight.heavy', medium: 'viewGraphics.weight.medium', light: 'viewGraphics.weight.light', hairline: 'viewGraphics.weight.hairline',
} as const satisfies Record<CategoryLineWeight, TranslationKey>;

interface CategoryGraphicsListProps {
  /** What a category draws now (the template's under the view's own, or the template's alone). */
  graphics: Record<string, CategoryGraphics> | undefined;
  /** The categories this target says something about itself, marked with a dot (a drawing's overrides of its template). */
  overridden?: Record<string, CategoryGraphics> | undefined;
  onChange: (category: string, patch: Partial<CategoryGraphics>) => void;
}

export function CategoryGraphicsList({ graphics, overridden, onChange }: CategoryGraphicsListProps) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {VIEW_CATEGORIES.map((category) => {
        const name = t(category.labelKey as TranslationKey);
        const g = graphics?.[category.id];
        const own = overridden?.[category.id];
        return (
          <li key={category.id} className="flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox" aria-label={t('wall.gfx.show', { category: name })} checked={g?.visible !== false}
              onChange={(e) => onChange(category.id, { visible: e.target.checked })}
            />
            <span className="min-w-0 flex-1 truncate">{name}{own ? <span aria-label={t('wall.gfx.overridden')} title={t('wall.gfx.overridden')} className="ml-1 text-cyan-400">●</span> : null}</span>
            <select
              aria-label={t('wall.gfx.weightOf', { category: name })} className={`${WALL_FIELD} !mt-0 !w-28 !py-0.5 !text-xs`} value={g?.lineWeight ?? ''}
              onChange={(e) => onChange(category.id, { lineWeight: (e.target.value || undefined) as CategoryLineWeight | undefined })}
            >
              <option value="">{t('wall.gfx.weightSet')}</option>
              {WEIGHTS.map((w) => <option key={w} value={w}>{t(WEIGHT_KEYS[w])}</option>)}
            </select>
          </li>
        );
      })}
    </ul>
  );
}
