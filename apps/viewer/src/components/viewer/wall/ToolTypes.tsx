/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The type (or symbol) a rail tool draws with. The tools of the rail read
 * the drafting session's current annotation type and symbol; this is where
 * the Wall sets them, from the project's own list, so a type or symbol that
 * arrived with an imported library is one choice away.
 */

import { applyAnnotationType } from '@/catalogue/annotation-type-actions';
import { allSymbols } from '@bimvoice/ifcsheet';
import { baseDraftSettings, patchDraftSettings, useDraftingSession } from '@/drafting/session';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { WALL_FIELD } from './wall-type';

const field = WALL_FIELD;

export function ToolTypes({ tool }: { tool: string }) {
  const { t } = useTranslation();
  useDraftingSession((s) => s.revision);
  const types = useProjectStore((s) => s.annotationTypes);
  const symbols = useProjectStore((s) => s.symbols);
  const settings = baseDraftSettings();

  if (tool === 'symbol') {
    const all = allSymbols(symbols ?? []);
    return (
      <label className="mt-4 block text-xs text-sky-200">
        {t('wall.type.symbol')}
        <select className={field} value={settings.symbolId ?? all[0]?.id ?? ''} onChange={(e) => patchDraftSettings({ symbolId: e.target.value })}>
          {all.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
    );
  }
  const mine = (types ?? []).filter((x) => x.tool === tool);
  if (mine.length === 0) return null;
  const current = settings.annotationType?.tool === tool ? settings.annotationType.id : '';
  return (
    <label className="mt-4 block text-xs text-sky-200">
      {t('wall.type.label')}
      <select
        className={field}
        value={mine.some((x) => x.id === current) ? current : ''}
        onChange={(e) => {
          if (e.target.value) applyAnnotationType(e.target.value);
          else patchDraftSettings({ annotationType: null });
        }}
      >
        <option value="">{t('wall.type.plain')}</option>
        {mine.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </label>
  );
}
